import { Message } from '../message.js';
import { AgentState } from '../agent.js';
import { ToolExecutor } from '../tools.js';
import { createErrorFromResponse } from '../errors.js';
import { buildHeaders, getRequestCredentials, RequestContext } from '../request.js';

export interface InvokeContext extends RequestContext {
  toolExecutor?: ToolExecutor;
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
  const timeoutId = setTimeout(() => controller.abort(), context.timeout);

  try {
    const response = await fetch(`${context.baseUrl}/v1/graph/invoke`, {
      method: 'POST',
      headers: buildHeaders(context as RequestContext, {
        'Content-Type': 'application/json',
        accept: 'application/json',
      }),
      ...getRequestCredentials(context as RequestContext),
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`TenxGraphClient: Invoke failed with HTTP ${response.status}`);
      const error = await createErrorFromResponse(
        response,
        'Invoke request failed',
        '/v1/invoke',
        'POST'
      );
      throw error;
    }

    const data: InvokeResponse = await response.json();
    return data;
  } catch (error) {
    clearTimeout(timeoutId);

    if ((error as Error).name === 'AbortError') {
      console.warn(`TenxGraphClient: Invoke timeout after ${context.timeout}ms`);
      throw new Error(`Request timeout after ${context.timeout}ms`);
    }

    console.error('TenxGraphClient: Invoke failed:', error);
    throw error;
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
  const recursion_limit = request.recursion_limit || 25;

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
  const config = request.config;
  const response_granularity = request.response_granularity;
  const on_busy = request.on_busy;
  const resume = request.resume;
  const interrupt_id = request.interrupt_id;

  // Main recursion loop
  while (iterations < recursion_limit) {
    iterations++;

    if (context.debug) {
      console.debug(`TenxGraphClient: Iteration ${iterations}/${recursion_limit}`);
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
        is_final: !hasToolCalls,
      };

      await onPartialResult(partialResult);
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

  // Check if we hit the recursion limit
  if (iterations >= recursion_limit) {
    recursionLimitReached = true;
    if (context.debug) {
      console.warn(`TenxGraphClient: Recursion limit of ${recursion_limit} reached`);
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

/**
 * Clean content blocks by removing empty arrays and undefined values
 * Server requires array of content blocks
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
function serializeMessage(message: Message): any {
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
