import { ResponseMetadata } from './metadata.js';
import { createErrorFromResponse } from '../errors.js';
import {
  buildHeaders,
  getRequestCredentials,
  RequestContext,
  fetchWithTimeout,
} from '../request.js';

export interface StopGraphContext extends RequestContext {}

export interface StopGraphRequest {
  thread_id: string;
  config?: Record<string, any>;
}

export interface StopGraphResponse {
  data: {
    /** False when the thread has no checkpointer or no saved state. */
    ok: boolean;
    /** True when a run was active and a stop was requested. */
    running?: boolean;
    /** Why nothing was stopped, e.g. 'no-checkpointer' or 'no-state'. */
    reason?: string;
    /** @deprecated The server never sends this field. Use `ok`. */
    success?: boolean;
    /** @deprecated The server never sends this field. */
    message?: string;
    /** @deprecated The server never sends this field. */
    thread_id?: string;
    /** @deprecated The server never sends this field. */
    stopped_at?: string;
  };
  metadata: ResponseMetadata;
}

/**
 * Stop a running graph execution for a specific thread
 *
 * @param context - Request context with baseUrl, auth, timeout
 * @param request - Stop request with thread_id and optional config
 * @returns Promise<StopGraphResponse> with stop operation result
 */
export async function stopGraph(
  context: StopGraphContext,
  request: StopGraphRequest
): Promise<StopGraphResponse> {
  try {
    if (context.debug) {
      console.debug('TenxGraphClient: Stopping graph execution for thread:', request.thread_id);
    }

    const response = await fetchWithTimeout(context, `${context.baseUrl}/v1/graph/stop`, {
      method: 'POST',
      headers: buildHeaders(context as RequestContext, {
        'Content-Type': 'application/json',
        accept: 'application/json',
      }),
      ...getRequestCredentials(context as RequestContext),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      console.warn(`TenxGraphClient: Stop graph failed with HTTP ${response.status}`);
      const error = await createErrorFromResponse(
        response,
        'Stop graph execution failed',
        '/v1/graph/stop',
        'POST'
      );
      throw error;
    }

    const data: StopGraphResponse = await response.json();

    if (context.debug) {
      console.info('TenxGraphClient: Graph execution stopped successfully', data);
    }

    return data;
  } catch (error) {
    if (context.debug) {
      console.debug('TenxGraphClient: Stop graph failed:', error);
    }

    console.error('TenxGraphClient: Stop graph failed:', error);
    throw error;
  }
}
