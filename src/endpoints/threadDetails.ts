import { ResponseMetadata } from './metadata.js';
import { createErrorFromResponse } from '../errors.js';
import {
  buildHeaders,
  getRequestCredentials,
  RequestContext,
  fetchWithTimeout,
  encodePathSegment,
} from '../request.js';

export interface ThreadDetailsContext extends RequestContext {}

export interface ThreadDetailsData {
  thread_data: {
    thread: Record<string, any>;
  };
}

export interface ThreadDetailsResponse {
  data: ThreadDetailsData;
  metadata: ResponseMetadata;
}

/**
 * Fetch details for a specific thread.
 * GET /v1/threads/{threadId}
 */
export async function threadDetails(
  context: ThreadDetailsContext,
  threadId: string | number
): Promise<ThreadDetailsResponse> {
  try {
    if (context.debug) {
      console.debug(`TenxGraphClient: Fetching thread details for thread ${threadId}`);
    }

    const url = `${context.baseUrl}/v1/threads/${encodePathSegment(threadId)}`;

    const response = await fetchWithTimeout(context, url, {
      method: 'GET',
      headers: buildHeaders(context as RequestContext, {
        'Content-Type': 'application/json',
        accept: 'application/json',
      }),
      ...getRequestCredentials(context as RequestContext),
    });

    if (!response.ok) {
      console.warn(`TenxGraphClient: Thread details fetch failed with HTTP ${response.status}`);
      const error = await createErrorFromResponse(
        response,
        'Thread details fetch failed',
        '/v1/threads/{thread_id}',
        'GET'
      );
      throw error;
    }

    const data: ThreadDetailsResponse = await response.json();

    if (context.debug) {
      console.info('TenxGraphClient: Thread details fetched successfully', data);
    }

    return data;
  } catch (error) {
    if (context.debug) {
      console.debug('TenxGraphClient: Thread details fetch failed:', error);
    }

    throw error;
  }
}
