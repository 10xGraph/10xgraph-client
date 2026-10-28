import { Message } from '../message.js';
import { AgentState } from '../agent.js';
import { ToolExecutor } from '../tools.js';
import { createErrorFromResponse } from '../errors.js';
import { buildHeaders, getRequestCredentials, RequestContext } from '../request.js';

export interface StreamContext extends RequestContext {
  toolExecutor?: ToolExecutor;
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

/**
 * Parse NDJSON stream and yield individual chunks immediately as they arrive
 * Handles streaming response body as async iterable
 * Supports both newline-separated and concatenated JSON objects
 */
async function* parseStreamChunks(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  debug: boolean
): AsyncGenerator<StreamChunk, void, unknown> {
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // Process any remaining data in buffer
        if (buffer.trim()) {
          yield* processBuffer(buffer, debug, true);
        }
        break;
      }

      // Append new data to buffer
      buffer += decoder.decode(value, { stream: true });

      // Immediately process and yield all complete chunks
      const result = yield* processBuffer(buffer, debug, false);
      buffer = result.remaining;
    }
  } finally {
    reader.releaseLock();
  }
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
        if (debug) {
          console.warn('TenxGraphClient: Failed to parse NDJSON line:', line.slice(0, 100), error);
        }
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
        if (debug) {
          console.warn(
            'TenxGraphClient: Failed to parse concatenated JSON:',
            extracted.json.slice(0, 100),
            error
          );
        }
        break;
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
          if (debug) {
            console.warn(
              'TenxGraphClient: Failed to parse final buffer:',
              buffer.slice(0, 100),
              error
            );
          }
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
  const recursion_limit = request.recursion_limit || 25;

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
  while (iterations < recursion_limit) {
    iterations++;

    if (context.debug) {
      console.debug(`TenxGraphClient: Stream iteration ${iterations}/${recursion_limit}`);
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

    // Open the stream and yield all chunks
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), context.timeout);

    try {
      const response = await fetch(`${context.baseUrl}/v1/graph/stream`, {
        method: 'POST',
        headers: buildHeaders(context as RequestContext, {
          'Content-Type': 'application/json',
          Accept: 'application/x-ndjson, application/json',
        }),
        ...getRequestCredentials(context as RequestContext),
        body: JSON.stringify(iterationRequest),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`TenxGraphClient: Stream failed with HTTP ${response.status}`);
        const error = await createErrorFromResponse(
          response,
          'Stream request failed',
          '/v1/stream',
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

      for await (const chunk of parseStreamChunks(reader, context.debug)) {
        // Yield every chunk to the caller
        yield chunk;

        // The server assigns a thread id when the caller omits one; reuse it so the
        // tool round-trip stays on the same thread. A caller-supplied id is never replaced.
        const returnedThreadId: string | undefined = chunk.thread_id || chunk.metadata?.thread_id;
        if (returnedThreadId && !config?.thread_id) {
          config = { ...(config ?? {}), thread_id: returnedThreadId };
        }

        // Also collect messages for tool execution check
        if (chunk.message) {
          responseMessages.push(chunk.message);
        }
      }

      if (context.debug) {
        console.info('TenxGraphClient: Stream iteration completed');
        console.debug('TenxGraphClient: Received', responseMessages.length, 'messages');
      }

      // Check if there are remote tool calls to execute
      const hasToolCalls = hasRemoteToolCalls(responseMessages);

      if (hasToolCalls && context.toolExecutor) {
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
      clearTimeout(timeoutId);

      if ((error as Error).name === 'AbortError') {
        console.warn(`TenxGraphClient: Stream timeout after ${context.timeout}ms`);
        throw new Error(`Request timeout after ${context.timeout}ms`);
      }

      console.error('TenxGraphClient: Stream failed:', error);
      throw error;
    }
  }

  // Check if we hit the recursion limit
  if (iterations >= recursion_limit) {
    if (context.debug) {
      console.warn(`TenxGraphClient: Recursion limit of ${recursion_limit} reached`);
    }
  }

  if (context.debug) {
    console.debug(`TenxGraphClient: Stream invoke completed after ${iterations} iterations`);
  }
}

/**
 * Clean content blocks by removing empty arrays and undefined values
 * Server requires array of content blocks, not simplified string
 */
function cleanContent(content: any[]): any[] {
  // Always return as array of blocks (server requires this format)
  return content.map((block) => {
    const cleaned: any = {};

    for (const [key, value] of Object.entries(block)) {
      // Skip empty arrays
      if (Array.isArray(value) && value.length === 0) {
        continue;
      }
      // Skip undefined values
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
