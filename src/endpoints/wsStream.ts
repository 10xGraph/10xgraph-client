import { Message } from '../message.js';
import { ToolExecutor } from '../tools.js';
import { RequestContext } from '../request.js';
import { buildWsUrl, openWebSocket } from '../ws.js';
import { StreamChunk, StreamEventType, StreamRequest, serializeMessage } from './stream.js';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface WsStreamContext extends RequestContext {
  toolExecutor?: ToolExecutor;
  /** Caller-supplied signal; aborting it closes the socket and ends the stream. */
  signal?: AbortSignal;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal types  (mirror the server's WsGraphInputSchema)
// ─────────────────────────────────────────────────────────────────────────────

interface WsGraphInput {
  invoke_type: 'fresh' | 'resume';
  messages?: any[];
  tool_result?: any[];
  initial_state?: Record<string, any>;
  config?: Record<string, any>;
  recursion_limit?: number;
  on_busy?: 'wait' | 'cancel';
  resume?: unknown;
  interrupt_id?: string;
  response_granularity?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** True when any collected message contains a remote_tool_call block. */
function hasRemoteToolCalls(messages: Message[]): boolean {
  return messages.some(
    (msg) => msg.content && msg.content.some((block: any) => block.type === 'remote_tool_call')
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Core implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stream invoke via a persistent WebSocket connection.
 *
 * The protocol is:
 *
 *   1. Connect to ``/v1/graph/ws`` (auth via the ``10xgraph-bearer`` subprotocol or Authorization header).
 *   2. Send ``{ invoke_type:"fresh", messages:[…], config:{…}, … }``.
 *   3. Receive ``StreamChunk`` JSON messages; yield each to the caller.
 *   4. Server sends ``{ event:"updates", data:{ status:"done" } }`` after each run.
 *   5. If the run contained remote tool calls, execute them and send:
 *      ``{ invoke_type:"resume", tool_result:[…], config:{ thread_id } }``.
 *   6. Repeat from step 3 until no more tool calls.
 *   7. Close the WebSocket.
 *
 * This replaces the HTTP loop in ``streamInvoke`` — the round-trip cost of
 * re-opening a new HTTP connection for each tool call is eliminated.
 *
 * @example
 * ```ts
 * const stream = wsStreamInvoke(context, request);
 * for await (const chunk of stream) {
 *   if (chunk.event === 'message') console.log(chunk.message);
 * }
 * ```
 */
export async function* wsStreamInvoke(
  context: WsStreamContext,
  request: StreamRequest
): AsyncGenerator<StreamChunk, void, unknown> {
  context.signal?.throwIfAborted();
  const url = buildWsUrl(context, '/v1/graph/ws');

  if (context.debug) {
    console.debug('TenxGraphClient [WS]: connecting to', url);
  }

  const ws = openWebSocket(url, context);

  // ── Queue bridge ──────────────────────────────────────────────────────────
  // WebSocket is event-based; async generators are pull-based.
  // We buffer incoming items in a queue and wake up the generator each time.
  const queue: Array<StreamChunk | Error | 'close'> = [];
  let wakeUp: (() => void) | null = null;

  const enqueue = (item: StreamChunk | Error | 'close'): void => {
    queue.push(item);
    if (wakeUp) {
      const fn = wakeUp;
      wakeUp = null;
      fn();
    }
  };

  const waitForItem = (): Promise<void> =>
    new Promise((resolve) => {
      if (queue.length > 0) {
        resolve();
      } else {
        wakeUp = resolve;
      }
    });

  ws.addEventListener('message', (event: MessageEvent) => {
    try {
      const chunk = JSON.parse(event.data as string) as StreamChunk;
      enqueue(chunk);
    } catch (e) {
      if (context.debug) {
        console.warn('TenxGraphClient [WS]: failed to parse chunk:', e);
      }
    }
  });

  ws.addEventListener('error', () => {
    enqueue(new Error('WebSocket error'));
  });

  ws.addEventListener('close', (event: CloseEvent) => {
    if (context.debug) {
      console.debug('TenxGraphClient [WS]: connection closed, code=', event.code);
    }
    enqueue('close');
  });

  const makeAbortError = (): Error => {
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    return err;
  };
  const onAbort = (): void => {
    enqueue(makeAbortError());
    if (ws.readyState === 1 || ws.readyState === 0) {
      ws.close(1000);
    }
  };
  context.signal?.addEventListener('abort', onAbort, { once: true });

  // Wait for the connection to open (or fail)
  await new Promise<void>((resolve, reject) => {
    if (context.signal?.aborted) {
      reject(makeAbortError());
      return;
    }
    context.signal?.addEventListener('abort', () => reject(makeAbortError()), { once: true });
    // Numeric readyState literals (OPEN===1) instead of WebSocket.OPEN: the
    // global WebSocket may be absent on Node < 21 when a custom impl is injected.
    if (ws.readyState === 1) {
      resolve();
      return;
    }
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener('error', () => reject(new Error('WebSocket connection failed')), {
      once: true,
    });
  });

  if (context.debug) {
    console.debug('TenxGraphClient [WS]: connected');
  }

  // ── Main loop ─────────────────────────────────────────────────────────────
  let threadId: string | undefined = (request.config as Record<string, any>)?.thread_id;

  let nextPayload: WsGraphInput = {
    invoke_type: 'fresh',
    messages: request.messages,
    initial_state: request.initial_state,
    config: request.config,
    recursion_limit: request.recursion_limit ?? 25,
    on_busy: request.on_busy,
    resume: request.resume,
    interrupt_id: request.interrupt_id,
    response_granularity: request.response_granularity,
  };

  try {
    outerLoop: while (true) {
      if (context.debug) {
        console.debug(
          `TenxGraphClient [WS]: sending ${nextPayload.invoke_type} request, thread_id=${threadId ?? 'new'}`
        );
      }

      ws.send(JSON.stringify(nextPayload));

      // ── Inner loop: receive chunks until the server sends "done" ──────
      const runMessages: Message[] = [];

      innerLoop: while (true) {
        await waitForItem();
        const item = queue.shift()!;

        if (item === 'close') {
          // Server closed the connection unexpectedly
          break outerLoop;
        }

        if (item instanceof Error) {
          throw item;
        }

        const chunk = item as StreamChunk;

        // Track thread_id for resume requests
        if (chunk.thread_id) {
          threadId = chunk.thread_id;
        }
        if ((chunk.metadata as Record<string, any>)?.thread_id) {
          threadId = (chunk.metadata as Record<string, any>).thread_id as string;
        }

        // "done" signal: current run is complete
        if (chunk.event === StreamEventType.UPDATES && (chunk.data as any)?.status === 'done') {
          break innerLoop;
        }

        // Accumulate messages for tool-call detection
        if (chunk.message) {
          runMessages.push(chunk.message);
        }

        // Yield every chunk to the caller (same as HTTP stream)
        yield chunk;
      }

      if (context.debug) {
        console.debug(
          `TenxGraphClient [WS]: run complete, ${runMessages.length} messages collected`
        );
      }

      // ── Tool-call detection & resume ──────────────────────────────────
      if (hasRemoteToolCalls(runMessages) && context.toolExecutor) {
        if (context.debug) {
          console.debug('TenxGraphClient [WS]: remote tool calls detected, executing…');
        }

        const toolResults = await context.toolExecutor.executeToolCalls(runMessages);

        if (context.debug) {
          console.debug(
            `TenxGraphClient [WS]: ${toolResults.length} tool result(s) ready, resuming`
          );
        }

        nextPayload = {
          invoke_type: 'resume',
          tool_result: toolResults.map(serializeMessage),
          config: { ...(request.config ?? {}), thread_id: threadId },
          recursion_limit: request.recursion_limit ?? 25,
          on_busy: request.on_busy,
          response_granularity: request.response_granularity,
        };
        // continue outerLoop → send resume request
      } else {
        // No tool calls — the full run is done
        break outerLoop;
      }
    }
  } finally {
    context.signal?.removeEventListener('abort', onAbort);
    // CONNECTING===0, OPEN===1 (numeric literals; the global WebSocket may be
    // absent on Node < 21 when a custom impl is injected).
    if (ws.readyState === 1 || ws.readyState === 0) {
      ws.close(1000);
    }

    if (context.debug) {
      console.debug('TenxGraphClient [WS]: stream finished');
    }
  }
}
