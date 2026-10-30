import { ResponseMetadata } from './metadata.js';
import { createErrorFromResponse } from '../errors.js';
import {
  buildHeaders,
  getRequestCredentials,
  RequestContext,
  fetchWithTimeout,
  encodePathSegment,
} from '../request.js';

export interface DeleteThreadMessageContext extends RequestContext {}

export interface DeleteThreadMessageRequest {
  threadId: string | number;
  messageId: string;
  config?: Record<string, any>;
}

export interface DeleteThreadMessageData {
  success: boolean;
  message: string;
  data: Record<string, any>;
}

export interface DeleteThreadMessageResponse {
  data: DeleteThreadMessageData;
  metadata: ResponseMetadata;
}

export async function deleteThreadMessage(
  context: DeleteThreadMessageContext,
  request: DeleteThreadMessageRequest
): Promise<DeleteThreadMessageResponse> {
  try {
    if (context.debug) {
      console.debug(
        'TenxGraphClient: Deleting thread message',
        `thread: ${request.threadId}`,
        `message: ${request.messageId}`
      );
    }

    const url = `${context.baseUrl}/v1/threads/${encodePathSegment(request.threadId)}/messages/${encodePathSegment(request.messageId)}`;

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
      console.warn(`TenxGraphClient: Delete thread message failed with HTTP ${response.status}`);
      const error = await createErrorFromResponse(
        response,
        'Delete thread message failed',
        '/v1/threads/{thread_id}/messages/{message_id}',
        'DELETE'
      );
      throw error;
    }

    const data: DeleteThreadMessageResponse = await response.json();

    if (context.debug) {
      console.info('TenxGraphClient: Thread message deleted successfully', data);
    }

    return data;
  } catch (error) {
    if (context.debug) {
      console.debug('TenxGraphClient: Delete thread message failed:', error);
    }
    throw error;
  }
}
