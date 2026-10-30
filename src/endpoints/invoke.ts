import { Message } from '../message.js';
import { AgentState } from '../agent.js';
import { ToolExecutor } from '../tools.js';
import {
  createErrorFromResponse,
  NetworkError,
  RequestTimeoutError,
  StreamError,
} from '../errors.js';
import { serializeMessage } from './stream.js';
import {
  buildHeaders,
  getRequestCredentials,
  linkAbortSignal,
  RequestContext,
} from '../request.js';

export interface InvokeContext extends RequestContext {
  toolExecutor?: ToolExecutor;
  /** Caller-supplied signal; aborting it cancels the in-flight request. */
  signal?: AbortSignal;
}

// Invoke Request payload
export interface InvokeRequest {
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

// Response metadata
export interface InvokeMetadata {
  is_new_thread: boolean;
  thread_id: string;
}

// Full invoke response from server (single call)
export interface InvokeResponse {
  data: {
    messages: Message[];
    state?: AgentState;
    context?: Message[];
    summary?: string | null;
    meta: InvokeMetadata;
  };
  metadata: {
    request_id: string;
    timestamp: string;
    message: string;
  };
}

// Result with all intermediate steps
export interface InvokeResult {
  messages: Message[];
  state?: AgentState;
  context?: Message[];
  summary?: string | null;
  meta: InvokeMetadata;
  all_messages: Message[]; // All messages including intermediate steps
  iterations: number;
  recursion_limit_reached: boolean;
}

// Partial result sent on each iteration
export interface InvokePartialResult {
  iteration: number;
  messages: Message[];
  state?: AgentState;
  context?: Message[];
  summary?: string | null;
  meta: InvokeMetadata;
  has_tool_calls: boolean;
  is_final: boolean;
}

// Callback type for receiving partial results
export type InvokeCallback = (partial: InvokePartialResult) => void | Promise<void>;

/**
 * Make a single API call to /v1/graph/invoke
 */
async function makeSingleInvokeCall(
  context: InvokeContext,
  request: InvokeRequest
): Promise<InvokeResponse> {
  const controller = new AbortController();
  // The timeout and the caller's signal stay armed until the body is read, so a server that
  // sends headers and then stalls is cut off too. A timeout of 0 means no timeout.
  const timeoutId =
    context.timeout > 0 ? setTimeout(() => controller.abort(), context.timeout) : undefined;
  const unlink = linkAbortSignal(controller, context.signal);

  try {
    let response: Response;
    try {
      response = await fetch(`${context.baseUrl}/v1/graph/invoke`, {
        method: 'POST',
        headers: buildHeaders(context as RequestContext, {
          'Content-Type': 'application/json',
          accept: 'application/json',
        }),
        ...getRequestCredentials(context as RequestContext),
        body: JSON.stringify(request),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof TypeError) {
        throw new NetworkError(
          `Network error: ${error.message}`,
          '/v1/graph/invoke',
          'POST',
          error
        );
      }
      throw error;
    }

    if (!response.ok) {
      console.warn(`TenxGraphClient: Invoke failed with HTTP ${response.status}`);
      const error = await createErrorFromResponse(
        response,
        'Invoke request failed',
        '/v1/graph/invoke',
        'POST'
      );
      throw error;
    }

    const data: InvokeResponse = await response.json();
    // A body without `data` (or without `messages`) must not crash the tool loop later.
    if (!data || typeof data !== 'object' || !data.data || typeof data.data !== 'object') {
      throw new StreamError(
        'Invoke response had no data object',
        'INVALID_RESPONSE',
        'unknown',
        '/v1/graph/invoke',
        'POST'
      );
    }
    if (!Array.isArray(data.data.messages)) {
      data.data.messages = [];
    }
    return data;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      if (context.signal?.aborted) {
        // Cancelled by the caller, not a timeout: surface the abort as is.
        throw error;
      }
      console.warn(`TenxGraphClient: Invoke timeout after ${context.timeout}ms`);
      throw new RequestTimeoutError(context.timeout, '/v1/graph/invoke', 'POST', error);
    }

    console.error('TenxGraphClient: Invoke failed:', error);
    throw error;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    unlink();
  }
}

/**
 * Check if response contains remote tool calls
 */
function hasRemoteToolCalls(response: InvokeResponse): boolean {
  if (!response.data || !response.data.messages) return false;

  return response.data.messages.some(
    (msg: Message) =>
      msg.content && msg.content.some((block: any) => block.type === 'remote_tool_call')
  );
}

/**
 * Invoke the graph with automatic tool execution loop
 * @param onPartialResult - Optional callback to receive results as they arrive
 */
export async function invoke(
  context: InvokeContext,
  request: InvokeRequest,
  onPartialResult?: InvokeCallback
): Promise<InvokeResult> {
  const recursion_limit = request.recursion_limit ?? 25;
  // At least one request is always sent; the limit caps tool round trips after that.
  const maxRuns = Math.max(1, recursion_limit);

  if (context.debug) {
    console.debug('TenxGraphClient: Starting invoke with recursion_limit:', recursion_limit);
    console.debug('TenxGraphClient: Initial request:', JSON.stringify(request, null, 2));
  }

  // Keep track of all messages across iterations
  const allMessages: Message[] = [];
  let currentMessages = request.messages;
  let iterations = 0;
  let recursionLimitReached = false;
  let lastResponse: InvokeResponse | undefined;
  const initial_state = request.initial_state;
  // Copied so a server-assigned thread_id can be added without touching the caller's object
  let config = request.config;
  const response_granularity = request.response_granularity;
  const on_busy = request.on_busy;
  const resume = request.resume;
  const interrupt_id = request.interrupt_id;

  // Main recursion loop
  while (true) {
    context.signal?.throwIfAborted();
    iterations++;

    if (context.debug) {
      console.debug(`TenxGraphClient: Iteration ${iterations}/${maxRuns}`);
    }

    // Prepare request for this iteration
    const iterationRequest: InvokeRequest = {
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
      console.debug('TenxGraphClient: Request payload:', JSON.stringify(iterationRequest, null, 2));
    }

    // Make the API call
    const response = await makeSingleInvokeCall(context, iterationRequest);
    lastResponse = response;

    // The server assigns a thread id when the caller omits one; reuse it so the
    // tool round-trip stays on the same thread. A caller-supplied id is never replaced.
    const returnedThreadId = response.data.meta?.thread_id;
    if (returnedThreadId && !config?.thread_id) {
      config = { ...(config ?? {}), thread_id: returnedThreadId };
    }

    if (context.debug) {
      console.info('TenxGraphClient: Invoke successful');
      console.debug('TenxGraphClient: Response:', JSON.stringify(response, null, 2));
    }

    // Add response messages to our collection
    if (response.data.messages) {
      allMessages.push(...response.data.messages);
    }

    // Check if there are remote tool calls to execute
    const hasToolCalls = hasRemoteToolCalls(response);

    // A tool round trip follows only while there is an executor and room under the limit
    const willContinue = hasToolCalls && !!context.toolExecutor && iterations < maxRuns;

    // Send partial result immediately if callback provided
    if (onPartialResult) {
      const partialResult: InvokePartialResult = {
        iteration: iterations,
        messages: response.data.messages,
        state: response.data.state,
        context: response.data.context,
        summary: response.data.summary,
        meta: response.data.meta,
        has_tool_calls: hasToolCalls,
        is_final: !willContinue,
      };

      await onPartialResult(partialResult);
    }

    if (hasToolCalls && context.toolExecutor && iterations >= maxRuns) {
      // The limit stopped a loop that still wanted tools: the server thread is left waiting
      recursionLimitReached = true;
      if (context.debug) {
        console.warn(`TenxGraphClient: Recursion limit of ${recursion_limit} reached`);
      }
      break;
    }

    if (hasToolCalls && context.toolExecutor) {
      if (context.debug) {
        console.debug('TenxGraphClient: Found remote tool calls, executing...');
      }

      // Execute all tool calls using the ToolExecutor
      const toolResults = await context.toolExecutor.executeToolCalls(response.data.messages);

      if (context.debug) {
        console.debug(`TenxGraphClient: Executed ${toolResults.length} tool calls`);
      }

      // Add tool results to all messages
      allMessages.push(...toolResults);

      // Serialize tool results for next iteration
      currentMessages = toolResults.map((msg) => serializeMessage(msg));

      // Continue the loop
      continue;
    } else {
      // No more tool calls, we're done
      if (context.debug) {
        console.debug('TenxGraphClient: No remote tool calls found, finishing');
      }
      break;
    }
  }

  // Construct the result
  const result: InvokeResult = {
    messages: lastResponse?.data.messages || [],
    state: lastResponse?.data.state,
    context: lastResponse?.data.context,
    summary: lastResponse?.data.summary,
    meta: lastResponse?.data.meta || { is_new_thread: false, thread_id: '' },
    all_messages: allMessages,
    iterations,
    recursion_limit_reached: recursionLimitReached,
  };

  if (context.debug) {
    console.debug(`TenxGraphClient: Invoke completed after ${iterations} iterations`);
    console.debug(`TenxGraphClient: Total messages: ${allMessages.length}`);
  }

  return result;
}
