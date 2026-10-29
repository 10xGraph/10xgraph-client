import { ResponseMetadata } from './metadata.js';
import { createErrorFromResponse } from '../errors.js';
import {
  buildHeaders,
  getRequestCredentials,
  RequestContext,
  fetchWithTimeout,
  encodePathSegment,
} from '../request.js';

export interface DeleteThreadContext extends RequestContext {}

export interface DeleteThreadRequest {
  threadId: string | number;
  config?: Record<string, any>;
}

export interface DeleteThreadData {
  success: boolean;
  message: string;
  data: boolean;
}

export interface DeleteThreadResponse {
  data: DeleteThreadData;
  metadata: ResponseMetadata;
}

export async function deleteThread(
  context: DeleteThreadContext,
  request: DeleteThreadRequest
): Promise<DeleteThreadResponse> {
  try {
    if (context.debug) {
      console.debug('TenxGraphClient: Deleting thread', `thread: ${request.threadId}`);
    }

    const url = `${context.baseUrl}/v1/threads/${encodePathSegment(request.threadId)}`;

    const response = await fetchWithTimeout(context, url, {
      method: 'DELETE',
      headers: buildHeaders(context as RequestContext, {
        'Content-Type': 'application/json',
        accept: 'application/json',
      }),
      ...getRequestCredentials(context as RequestContext),
      body: JSON.stringify({ config: request.config || {} }),
    });

    if (!response.ok) {
      console.warn(`TenxGraphClient: Delete thread failed with HTTP ${response.status}`);
      const error = await createErrorFromResponse(
        response,
        'Delete thread failed',
        '/v1/threads/{thread_id}',
        'DELETE'
      );
      throw error;
    }

    const data: DeleteThreadResponse = await response.json();

    if (context.debug) {
      console.info('TenxGraphClient: Thread deleted successfully', data);
    }

    return data;
  } catch (error) {
    if (context.debug) {
      console.debug('TenxGraphClient: Delete thread failed:', error);
    }
    throw error;
  }
}
