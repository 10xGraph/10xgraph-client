import { ResponseMetadata } from './metadata.js';
import { createErrorFromResponse } from '../errors.js';
import {
  buildHeaders,
  getRequestCredentials,
  RequestContext,
  fetchWithTimeout,
  encodePathSegment,
} from '../request.js';

export interface ClearThreadStateContext extends RequestContext {}

export interface ClearThreadStateData {
  success: boolean;
  message: string;
  data: boolean;
}

export interface ClearThreadStateResponse {
  data: ClearThreadStateData;
  metadata: ResponseMetadata;
}

export async function clearThreadState(
  context: ClearThreadStateContext,
  threadId: string | number
): Promise<ClearThreadStateResponse> {
  try {
    if (context.debug) {
      console.debug(`TenxGraphClient: Clearing thread state for thread ${threadId}`);
    }

    const response = await fetchWithTimeout(
      context,
      `${context.baseUrl}/v1/threads/${encodePathSegment(threadId)}/state`,
      {
        method: 'DELETE',
        headers: buildHeaders(context as RequestContext, {
          'Content-Type': 'application/json',
          accept: 'application/json',
        }),
        ...getRequestCredentials(context as RequestContext),
      }
    );

    if (!response.ok) {
      console.warn(`TenxGraphClient: Thread state clear failed with HTTP ${response.status}`);
      const error = await createErrorFromResponse(
        response,
        'Thread state clear failed',
        '/v1/threads/{thread_id}/state',
        'DELETE'
      );
      throw error;
    }

    const data: ClearThreadStateResponse = await response.json();

    if (context.debug) {
      console.info(
        `TenxGraphClient: Thread state cleared successfully for thread ${threadId}`,
        data
      );
    }

    return data;
  } catch (error) {
    if (context.debug) {
      console.debug(`TenxGraphClient: Thread state clear failed:`, error);
    }

    throw error;
  }
}
