import { Message } from '../message.js';
import { ToolExecutor } from '../tools.js';
import { RequestContext } from '../request.js';
import { buildWsUrl, openWebSocket } from '../ws.js';
import { RequestTimeoutError, StreamError, WebSocketError } from '../errors.js';
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

const WS_ENDPOINT = '/v1/graph/ws';

/** What the socket listeners hand to the generator. */
type QueueItem = StreamChunk | Error | { closed: true; code: number };

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
  const url = buildWsUrl(context, WS_ENDPOINT);

  if (context.debug) {
    console.debug('TenxGraphClient [WS]: connecting to', url);
  }

  const ws = openWebSocket(url, context);
  const recursion_limit = request.recursion_limit ?? 25;
  // At least one run is always sent; the limit caps tool resumes after that.
  const maxRuns = Math.max(1, recursion_limit);
  // The timeout is an idle timeout: it applies while waiting for the socket to open and
  // while waiting for the next frame, never while the caller processes a chunk.
  const idleMs = context.timeout > 0 ? context.timeout : 0;

  // ── Queue bridge ──────────────────────────────────────────────────────────
  // WebSocket is event-based; async generators are pull-based.
  // We buffer incoming items in a queue and wake up the generator each time.
  const queue: QueueItem[] = [];
  let wakeUp: (() => void) | null = null;

  const enqueue = (item: QueueItem): void => {
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

  /** Next queued item, or a timeout error item when nothing arrives within the idle window. */
  const nextItem = async (): Promise<QueueItem> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (idleMs > 0) {
      timer = setTimeout(() => enqueue(new RequestTimeoutError(idleMs, WS_ENDPOINT, 'WS')), idleMs);
    }
    try {
      await waitForItem();
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
    return queue.shift()!;
  };

  ws.addEventListener('message', (event: MessageEvent) => {
    try {
      const chunk = JSON.parse(event.data as string) as StreamChunk;
      enqueue(chunk);
    } catch (e) {
      // A frame that is not JSON means the stream is corrupt; do not skip it silently.
      enqueue(
        new StreamError(
          'WebSocket frame could not be parsed as JSON',
          'STREAM_TRUNCATED',
          'unknown',
          WS_ENDPOINT,
          'WS',
          e
        )
      );
    }
  });

  ws.addEventListener('error', () => {
    enqueue(new WebSocketError('WebSocket error', undefined, WS_ENDPOINT));
  });

  ws.addEventListener('close', (event: CloseEvent) => {
    if (context.debug) {
      console.debug('TenxGraphClient [WS]: connection closed, code=', event.code);
    }
    enqueue({ closed: true, code: event.code });
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

  try {
    // Wait for the connection to open (or fail). Every listener added here is removed again,
    // whichever way the wait ends.
    await new Promise<void>((resolve, reject) => {
      if (context.signal?.aborted) {
        reject(makeAbortError());
        return;
      }
      // Numeric readyState literals (OPEN===1) instead of WebSocket.OPEN: the
      // global WebSocket may be absent on Node < 22 when a custom impl is injected.
      if (ws.readyState === 1) {
        resolve();
        return;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = (): void => {
        if (timer !== undefined) clearTimeout(timer);
        ws.removeEventListener('open', onOpen);
        ws.removeEventListener('error', onError);
        ws.removeEventListener('close', onClose);
        context.signal?.removeEventListener('abort', onConnectAbort);
      };
      const onOpen = (): void => {
        cleanup();
        resolve();
      };
      const onError = (): void => {
        cleanup();
        reject(new WebSocketError('WebSocket connection failed', undefined, WS_ENDPOINT));
      };
      const onClose = (e: Event): void => {
        cleanup();
        const code = (e as CloseEvent)?.code;
        reject(
          new WebSocketError(`WebSocket closed before it opened (code ${code})`, code, WS_ENDPOINT)
        );
      };
      const onConnectAbort = (): void => {
        cleanup();
        reject(makeAbortError());
      };
      ws.addEventListener('open', onOpen);
      ws.addEventListener('error', onError);
      ws.addEventListener('close', onClose);
      context.signal?.addEventListener('abort', onConnectAbort, { once: true });
      if (idleMs > 0) {
        timer = setTimeout(() => {
          cleanup();
          reject(new RequestTimeoutError(idleMs, WS_ENDPOINT, 'WS'));
        }, idleMs);
      }
    });
    // Anything queued while connecting (an error event that raced the open) is stale.
    queue.length = 0;

    if (context.debug) {
      console.debug('TenxGraphClient [WS]: connected');
    }

    // ── Main loop ───────────────────────────────────────────────────────────
    let threadId: string | undefined = (request.config as Record<string, any>)?.thread_id;
    let runs = 0;

    let nextPayload: WsGraphInput = {
      invoke_type: 'fresh',
      messages: request.messages,
      initial_state: request.initial_state,
      config: request.config,
      recursion_limit,
      on_busy: request.on_busy,
      resume: request.resume,
      interrupt_id: request.interrupt_id,
      response_granularity: request.response_granularity,
    };

    outerLoop: while (true) {
      runs++;
      if (context.debug) {
        console.debug(
          `TenxGraphClient [WS]: sending ${nextPayload.invoke_type} request, thread_id=${threadId ?? 'new'}`
        );
      }

      ws.send(JSON.stringify(nextPayload));

      // ── Inner loop: receive chunks until the server sends "done" ──────
      const runMessages: Message[] = [];

      innerLoop: while (true) {
        const item = await nextItem();

        if ('closed' in item) {
          // The server closed the socket before it finished the run (1012 restart,
          // 1013 busy, 1008 policy, 1011 error ...). Never report that as success.
          throw new WebSocketError(
            `WebSocket closed before the run finished (code ${item.code})`,
            item.code,
            WS_ENDPOINT
          );
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

        // The server sends no "done" after an error chunk (busy thread, rate limit, not
        // authorized, shutdown cut with data.interrupted). The error ends the run.
        if (chunk.event === StreamEventType.ERROR) {
          break outerLoop;
        }
      }

      if (context.debug) {
        console.debug(
          `TenxGraphClient [WS]: run complete, ${runMessages.length} messages collected`
        );
      }

      // ── Tool-call detection & resume ──────────────────────────────────
      if (hasRemoteToolCalls(runMessages) && context.toolExecutor) {
        if (runs >= maxRuns) {
          if (context.debug) {
            console.warn(`TenxGraphClient [WS]: recursion limit of ${recursion_limit} reached`);
          }
          yield {
            event: StreamEventType.ERROR,
            data: {
              recursion_limit_reached: true,
              message: `Recursion limit of ${recursion_limit} reached with tool calls still pending`,
            },
            thread_id: threadId,
          };
          break outerLoop;
        }

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
          recursion_limit,
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
    // absent on Node < 22 when a custom impl is injected).
    if (ws.readyState === 1 || ws.readyState === 0) {
      ws.close(1000);
    }

    if (context.debug) {
      console.debug('TenxGraphClient [WS]: stream finished');
    }
  }
}
