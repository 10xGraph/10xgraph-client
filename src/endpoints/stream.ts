import { Message } from '../message.js';
import { AgentState } from '../agent.js';
import { ToolExecutor } from '../tools.js';
import {
  createErrorFromResponse,
  NetworkError,
  RequestTimeoutError,
  StreamError,
} from '../errors.js';
import {
  buildHeaders,
  getRequestCredentials,
  linkAbortSignal,
  RequestContext,
} from '../request.js';

export interface StreamContext extends RequestContext {
  toolExecutor?: ToolExecutor;
  /** Caller-supplied signal; aborting it cancels the request, including the open stream. */
  signal?: AbortSignal;
}

// Stream Request payload (same as Invoke)
export interface StreamRequest {
  messages: any[]; // Will be serialized Message objects
  initial_state?: Record<string, any>;
  config?: Record<string, any>;
  recursion_limit?: number;
  /** What to do when another run is active on the same thread (server default: 'wait'). */
  on_busy?: 'wait' | 'cancel';
  /** Value that answers an open interrupt. Send together with `interrupt_id`. */
  resume?: unknown;
  /** Id of the interrupt being answered by `resume`. */
  interrupt_id?: string;
  response_granularity?: 'full' | 'partial' | 'low';
}

// Stream Events
export enum StreamEventType {
  MESSAGE = 'message',
  UPDATES = 'updates',
  STATE = 'state',
  ERROR = 'error',
}

// Response metadata
export interface StreamMetadata {
  is_new_thread: boolean;
  thread_id: string;
  [key: string]: any;
}

// Individual stream chunk from server
export interface StreamChunk {
  event: StreamEventType | string;
  message?: Message | null;
  state?: AgentState | null;
  data?: any;
  thread_id?: string;
  run_id?: string;
  metadata?: StreamMetadata | Record<string, any>;
  timestamp?: number;
}

/** Hooks that let the caller run an idle timer only while it waits on the network. */
interface ReadHooks {
  beforeRead: () => void;
  afterRead: () => void;
}

const STREAM_ENDPOINT = '/v1/graph/stream';

/**
 * Parse NDJSON stream and yield individual chunks immediately as they arrive
 * Handles streaming response body as async iterable
 * Supports both newline-separated and concatenated JSON objects
 *
 * Leaving the loop early (break, throw, return) cancels the reader so the connection closes.
 * A body that is cut mid-chunk, or a line that is not JSON, throws StreamError instead of
 * ending as if the run had succeeded.
 */
async function* parseStreamChunks(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  debug: boolean,
  hooks?: ReadHooks
): AsyncGenerator<StreamChunk, void, unknown> {
  const decoder = new TextDecoder();
  let buffer = '';
  let completed = false;

  try {
    while (true) {
      let result: ReadableStreamReadResult<Uint8Array>;
      hooks?.beforeRead();
      try {
        result = await reader.read();
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') throw error;
        throw new StreamError(
          `Stream connection lost: ${(error as Error)?.message ?? String(error)}`,
          'STREAM_INTERRUPTED',
          'unknown',
          STREAM_ENDPOINT,
          'POST',
          error
        );
      } finally {
        hooks?.afterRead();
      }
      const { done, value } = result;

      if (done) {
        // Process any remaining data in buffer
        buffer += decoder.decode();
        if (buffer.trim()) {
          yield* processBuffer(buffer, debug, true);
        }
        completed = true;
        break;
      }

      // Append new data to buffer
      buffer += decoder.decode(value, { stream: true });

      // Immediately process and yield all complete chunks
      const processed = yield* processBuffer(buffer, debug, false);
      buffer = processed.remaining;
    }
  } finally {
    if (!completed) {
      // Early exit: tell the server side to stop sending so the connection is released.
      try {
        await reader.cancel();
      } catch {
        /* already errored or closed */
      }
    }
    reader.releaseLock();
  }
}

function badChunk(text: string, cause: unknown): StreamError {
  return new StreamError(
    `Stream data could not be parsed (${text.slice(0, 100)}); the stream was cut or corrupted`,
    'STREAM_TRUNCATED',
    'unknown',
    STREAM_ENDPOINT,
    'POST',
    cause
  );
}

/**
 * Process buffer and yield all complete JSON chunks
 * Returns the remaining incomplete buffer
 */
function* processBuffer(
  buffer: string,
  debug: boolean,
  isFinal: boolean
): Generator<StreamChunk, { remaining: string }, unknown> {
  // First, try to process newline-separated lines (NDJSON format)
  while (buffer.includes('\n')) {
    const newlineIndex = buffer.indexOf('\n');
    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);

    if (line) {
      try {
        const chunk = JSON.parse(line) as StreamChunk;
        if (debug) {
          console.debug('TenxGraphClient: Stream chunk received (NDJSON):', chunk.event);
        }
        yield chunk;
      } catch (error) {
        throw badChunk(line, error);
      }
    }
  }

  // Then, try to extract concatenated JSON objects (no newlines)
  while (buffer.trim()) {
    const extracted = extractFirstJSON(buffer);
    if (extracted) {
      try {
        const chunk = JSON.parse(extracted.json) as StreamChunk;
        if (debug) {
          console.debug('TenxGraphClient: Stream chunk received (concat):', chunk.event);
        }
        yield chunk;
        buffer = extracted.remaining;
      } catch (error) {
        throw badChunk(extracted.json, error);
      }
    } else {
      // Incomplete JSON, keep in buffer
      if (isFinal && buffer.trim()) {
        // On final read, try to parse what's left
        try {
          const chunk = JSON.parse(buffer.trim()) as StreamChunk;
          if (debug) {
            console.debug('TenxGraphClient: Final stream chunk:', chunk.event);
          }
          yield chunk;
          buffer = '';
        } catch (error) {
          throw badChunk(buffer.trim(), error);
        }
      }
      break;
    }
  }

  return { remaining: buffer };
}

/**
 * Extract the first complete JSON object from a string that may contain multiple concatenated JSON objects
 * Returns the JSON string and the remaining buffer
 */
function extractFirstJSON(buffer: string): { json: string; remaining: string } | null {
  buffer = buffer.trim();
  if (!buffer || buffer[0] !== '{') {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < buffer.length; i++) {
    const char = buffer[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        // Found complete JSON object
        return {
          json: buffer.slice(0, i + 1),
          remaining: buffer.slice(i + 1).trim(),
        };
      }
    }
  }

  // Incomplete JSON object
  return null;
}

/**
 * Check if messages contain remote tool calls
 */
function hasRemoteToolCalls(messages: Message[]): boolean {
  return messages.some(
    (msg: Message) =>
      msg.content && msg.content.some((block: any) => block.type === 'remote_tool_call')
  );
}

/**
 * Stream invoke to the graph with automatic tool execution loop
 * Returns an async iterable that yields stream chunks as they arrive
 *
 * This implements the same tool execution loop as invoke(), but uses
 * HTTP streaming instead of REST API calls.
 *
 * @example
 * ```ts
 * const stream = streamInvoke(context, request);
 * for await (const chunk of stream) {
 *   if (chunk.event === 'message') {
 *     console.log('Message:', chunk.message);
 *   } else if (chunk.event === 'updates') {
 *     console.log('State:', chunk.state);
 *   }
 * }
 * ```
 */
export async function* streamInvoke(
  context: StreamContext,
  request: StreamRequest
): AsyncGenerator<StreamChunk, void, unknown> {
  const recursion_limit = request.recursion_limit ?? 25;
  // At least one request is always sent; the limit caps tool round trips after that.
  const maxRuns = Math.max(1, recursion_limit);
  const timeoutMs = context.timeout > 0 ? context.timeout : 0;

  if (context.debug) {
    console.debug('TenxGraphClient: Starting stream invoke with recursion_limit:', recursion_limit);
    console.debug('TenxGraphClient: Initial request:', JSON.stringify(request, null, 2));
  }

  let currentMessages = request.messages;
  let iterations = 0;
  const initial_state = request.initial_state;
  // Copied so a server-assigned thread_id can be added without touching the caller's object
  let config = request.config;
  const response_granularity = request.response_granularity;
  const on_busy = request.on_busy;
  const resume = request.resume;
  const interrupt_id = request.interrupt_id;

  // Main recursion loop (same as invoke, but using streaming)
  while (true) {
    context.signal?.throwIfAborted();
    iterations++;

    if (context.debug) {
      console.debug(`TenxGraphClient: Stream iteration ${iterations}/${maxRuns}`);
    }

    // Prepare request for this iteration
    const iterationRequest: StreamRequest = {
      messages: currentMessages,
      initial_state: iterations === 1 ? initial_state : undefined,
      config,
      recursion_limit,
      on_busy,
      resume: iterations === 1 ? resume : undefined,
      interrupt_id: iterations === 1 ? interrupt_id : undefined,
      response_granularity,
    };

    if (context.debug) {
      console.debug(
        'TenxGraphClient: Stream request payload:',
        JSON.stringify(iterationRequest, null, 2)
      );
    }

    // Open the stream and yield all chunks. The timeout is an idle timeout: it runs while the
    // client waits on the network (headers, then each body read) and is paused while the
    // caller processes a chunk, so a stalled proxy is cut but a slow consumer is not.
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const disarm = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };
    const arm = (): void => {
      disarm();
      if (timeoutMs > 0) timer = setTimeout(() => controller.abort(), timeoutMs);
    };
    const unlink = linkAbortSignal(controller, context.signal);
    let finished = false;
    let sawError = false;

    try {
      arm();
      let response: Response;
      try {
        response = await fetch(`${context.baseUrl}${STREAM_ENDPOINT}`, {
          method: 'POST',
          headers: buildHeaders(context as RequestContext, {
            'Content-Type': 'application/json',
            Accept: 'application/x-ndjson, application/json',
          }),
          ...getRequestCredentials(context as RequestContext),
          body: JSON.stringify(iterationRequest),
          signal: controller.signal,
        });
      } catch (error) {
        if (error instanceof TypeError) {
          throw new NetworkError(`Network error: ${error.message}`, STREAM_ENDPOINT, 'POST', error);
        }
        throw error;
      }
      disarm();

      if (!response.ok) {
        console.warn(`TenxGraphClient: Stream failed with HTTP ${response.status}`);
        arm();
        const error = await createErrorFromResponse(
          response,
          'Stream request failed',
          STREAM_ENDPOINT,
          'POST'
        );
        throw error;
      }

      if (!response.body) {
        throw new Error('No response body for stream');
      }

      // Collect messages while yielding chunks
      const responseMessages: Message[] = [];
      const reader = response.body.getReader();

      for await (const chunk of parseStreamChunks(reader, context.debug, {
        beforeRead: arm,
        afterRead: disarm,
      })) {
        // Yield every chunk to the caller
        yield chunk;

        // The server assigns a thread id when the caller omits one; reuse it so the
        // tool round-trip stays on the same thread. A caller-supplied id is never replaced.
        const returnedThreadId: string | undefined = chunk.thread_id || chunk.metadata?.thread_id;
        if (returnedThreadId && !config?.thread_id) {
          config = { ...(config ?? {}), thread_id: returnedThreadId };
        }

        // An error chunk (including a shutdown cut with data.interrupted) ends the run.
        if (chunk.event === StreamEventType.ERROR) {
          sawError = true;
        }

        // Also collect messages for tool execution check
        if (chunk.message) {
          responseMessages.push(chunk.message);
        }
      }
      finished = true;

      if (context.debug) {
        console.info('TenxGraphClient: Stream iteration completed');
        console.debug('TenxGraphClient: Received', responseMessages.length, 'messages');
      }

      // Check if there are remote tool calls to execute
      const hasToolCalls = hasRemoteToolCalls(responseMessages);

      if (hasToolCalls && context.toolExecutor && !sawError) {
        if (iterations >= maxRuns) {
          // The limit stops the loop with the server thread still waiting for tool results.
          // Say so in the stream instead of ending as if the run were complete.
          if (context.debug) {
            console.warn(`TenxGraphClient: Recursion limit of ${recursion_limit} reached`);
          }
          yield {
            event: StreamEventType.ERROR,
            data: {
              recursion_limit_reached: true,
              message: `Recursion limit of ${recursion_limit} reached with tool calls still pending`,
            },
            thread_id: config?.thread_id,
          };
          break;
        }

        if (context.debug) {
          console.debug('TenxGraphClient: Found remote tool calls, executing...');
        }

        // Execute all tool calls using the ToolExecutor
        const toolResults = await context.toolExecutor.executeToolCalls(responseMessages);

        if (context.debug) {
          console.debug(`TenxGraphClient: Executed ${toolResults.length} tool calls`);
        }

        // Serialize tool results for next iteration
        currentMessages = toolResults.map((msg) => serializeMessage(msg));

        // Continue the loop with tool results
        continue;
      } else {
        // No more tool calls, we're done
        if (context.debug) {
          console.debug('TenxGraphClient: No remote tool calls found, finishing');
        }
        break;
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        if (context.signal?.aborted) {
          // Cancelled by the caller, not a timeout: surface the abort as is.
          throw error;
        }
        console.warn(`TenxGraphClient: Stream timeout after ${context.timeout}ms`);
        throw new RequestTimeoutError(context.timeout, STREAM_ENDPOINT, 'POST', error);
      }

      console.error('TenxGraphClient: Stream failed:', error);
      throw error;
    } finally {
      disarm();
      unlink();
      // Early exit (the caller broke out of the loop, or an error): cancel the request so
      // the connection closes and the server run releases its thread lock.
      if (!finished) controller.abort();
    }
  }

  if (context.debug) {
    console.debug(`TenxGraphClient: Stream invoke completed after ${iterations} iterations`);
  }
}

/**
 * Clean content blocks by removing undefined values (empty arrays are kept)
 * Server requires array of content blocks, not simplified string
 */
function cleanContent(content: any[]): any[] {
  // Always return as array of blocks (server requires this format)
  return content.map((block) => {
    const cleaned: any = {};

    for (const [key, value] of Object.entries(block)) {
      // Skip undefined values (empty arrays are real data, e.g. a tool result of [])
      if (value === undefined) {
        continue;
      }
      cleaned[key] = value;
    }

    return cleaned;
  });
}

/**
 * Serialize a Message object for API transmission
 */
export function serializeMessage(message: Message): any {
  const serialized: any = {
    role: message.role,
    content: cleanContent(message.content),
  };

  // message_id: use "0" if not set (server will generate one)
  if (message.message_id !== null && message.message_id !== undefined) {
    serialized.message_id = String(message.message_id);
  } else {
    serialized.message_id = '0';
  }

  // Only include optional fields if they are explicitly set
  if (message.tools_calls) {
    serialized.tools_calls = message.tools_calls;
  }
  if (message.metadata && Object.keys(message.metadata).length > 0) {
    serialized.metadata = message.metadata;
  }

  return serialized;
}
