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

export interface ThreadStateContext extends RequestContext {}

export interface ThreadStateData {
  state: AgentState;
}

export interface ThreadStateResponse {
  data: ThreadStateData;
  metadata: ResponseMetadata;
}

export async function threadState(
  context: ThreadStateContext,
  threadId: string | number
): Promise<ThreadStateResponse> {
  try {
    if (context.debug) {
      console.debug(`TenxGraphClient: Fetching thread state for thread ${threadId}`);
    }

    const response = await fetchWithTimeout(
      context,
      `${context.baseUrl}/v1/threads/${encodePathSegment(threadId)}/state`,
      {
        method: 'GET',
        headers: buildHeaders(context as RequestContext, {
          'Content-Type': 'application/json',
          accept: 'application/json',
        }),
        ...getRequestCredentials(context as RequestContext),
      }
    );

    if (!response.ok) {
      console.warn(`TenxGraphClient: Thread state fetch failed with HTTP ${response.status}`);
      const error = await createErrorFromResponse(
        response,
        'Thread state fetch failed',
        '/v1/threads/{thread_id}/state',
        'GET'
      );
      throw error;
    }

    const data: ThreadStateResponse = await response.json();

    if (context.debug) {
      console.info(
        `TenxGraphClient: Thread state fetched successfully for thread ${threadId}`,
        data
      );
    }

    return data;
  } catch (error) {
    if (context.debug) {
      console.debug(`TenxGraphClient: Thread state fetch failed:`, error);
    }

    throw error;
  }
}
