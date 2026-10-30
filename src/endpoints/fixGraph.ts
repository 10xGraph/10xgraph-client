import { ResponseMetadata } from './metadata.js';
import { createErrorFromResponse } from '../errors.js';
import {
  buildHeaders,
  getRequestCredentials,
  RequestContext,
  fetchWithTimeout,
} from '../request.js';

export interface FixGraphContext extends RequestContext {}

export interface FixGraphRequest {
  thread_id: string;
  config?: Record<string, any>;
}

export interface FixGraphResponse {
  data: {
    success: boolean;
    message: string;
    removed_count: number;
    state?: Record<string, any>;
  };
  metadata: ResponseMetadata;
}

/**
 * Repair a thread whose run stopped after the model asked for tools but before
 * the results were saved.
 *
 * The server removes an assistant message when any of its tool calls has no
 * matching tool result (matched by tool call id), then removes tool result
 * messages whose call no longer exists. If the thread is paused (interrupt,
 * client tool call or human approval), the unanswered calls of the latest
 * assistant message are kept. Messages without tool calls are never touched.
 * When nothing needs fixing, removed_count is 0 and the state is not written.
 *
 * @param context - Request context with baseUrl, auth, timeout
 * @param request - Fix request with thread_id and optional config
 * @returns Promise<FixGraphResponse> with fix operation result
 */
export async function fixGraph(
  context: FixGraphContext,
  request: FixGraphRequest
): Promise<FixGraphResponse> {
  try {
    if (context.debug) {
      console.debug('TenxGraphClient: Fixing graph state for thread:', request.thread_id);
    }

    const response = await fetchWithTimeout(context, `${context.baseUrl}/v1/graph/fix`, {
      method: 'POST',
      headers: buildHeaders(context as RequestContext, {
        'Content-Type': 'application/json',
        accept: 'application/json',
      }),
      ...getRequestCredentials(context as RequestContext),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      console.warn(`TenxGraphClient: Fix graph failed with HTTP ${response.status}`);
      const error = await createErrorFromResponse(
        response,
        'Fix graph state failed',
        '/v1/graph/fix',
        'POST'
      );
      throw error;
    }

    const data: FixGraphResponse = await response.json();

    if (context.debug) {
      console.info('TenxGraphClient: Graph state fixed successfully', {
        removed_count: data.data.removed_count,
        success: data.data.success,
      });
    }

    return data;
  } catch (error) {
    if (context.debug) {
      console.debug('TenxGraphClient: Fix graph failed:', error);
    }

    console.error('TenxGraphClient: Fix graph failed:', error);
    throw error;
  }
}
