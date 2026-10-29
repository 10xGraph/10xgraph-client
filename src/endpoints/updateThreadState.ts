import { ResponseMetadata } from './metadata.js';
import { AgentState } from '../agent.js';
import { createErrorFromResponse } from '../errors.js';
import {
  buildHeaders,
  getRequestCredentials,
  RequestContext,
  fetchWithTimeout,
  encodePathSegment,
} from '../request.js';

export interface UpdateThreadStateContext extends RequestContext {}

/**
 * State fields the server accepts on update. `context_summary` and `execution_meta` are
 * rejected by the server, so they are not part of this type.
 */
export type UpdatableThreadState = Partial<Omit<AgentState, 'context_summary' | 'execution_meta'>> &
  Record<string, any>;

export interface UpdateThreadStateRequest {
  config: Record<string, any>;
  state: UpdatableThreadState;
}

export interface UpdateThreadStateData {
  state: AgentState;
}

export interface UpdateThreadStateResponse {
  data: UpdateThreadStateData;
  metadata: ResponseMetadata;
}

export async function updateThreadState(
  context: UpdateThreadStateContext,
  threadId: string | number,
  request: UpdateThreadStateRequest
): Promise<UpdateThreadStateResponse> {
  try {
    if (context.debug) {
      console.debug(`TenxGraphClient: Updating thread state for thread ${threadId}`);
      console.debug(`TenxGraphClient: Request payload:`, JSON.stringify(request, null, 2));
    }

    const response = await fetchWithTimeout(
      context,
      `${context.baseUrl}/v1/threads/${encodePathSegment(threadId)}/state`,
      {
        method: 'PUT',
        headers: buildHeaders(context as RequestContext, {
          'Content-Type': 'application/json',
          accept: 'application/json',
        }),
        ...getRequestCredentials(context as RequestContext),
        body: JSON.stringify(request),
      }
    );

    if (!response.ok) {
      console.warn(`TenxGraphClient: Thread state update failed with HTTP ${response.status}`);
      const error = await createErrorFromResponse(
        response,
        'Thread state update failed',
        '/v1/threads/{thread_id}/state',
        'PUT'
      );
      throw error;
    }

    const data: UpdateThreadStateResponse = await response.json();

    if (context.debug) {
      console.info(
        `TenxGraphClient: Thread state updated successfully for thread ${threadId}`,
        data
      );
    }

    return data;
  } catch (error) {
    if (context.debug) {
      console.debug(`TenxGraphClient: Thread state update failed:`, error);
    }

    throw error;
  }
}
