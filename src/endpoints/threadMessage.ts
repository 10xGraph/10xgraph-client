import { ResponseMetadata } from './metadata.js';
import { Message } from '../message.js';
import { createErrorFromResponse } from '../errors.js';
import {
  buildHeaders,
  getRequestCredentials,
  RequestContext,
  fetchWithTimeout,
  encodePathSegment,
} from '../request.js';

export interface ThreadMessageContext extends RequestContext {}

export interface ThreadMessageRequest {
  threadId: string | number;
  messageId: string;
}

export interface ThreadMessageData extends Message {
  // This extends the Message class to ensure type compatibility
  // The API returns a message object directly as data
}

export interface ThreadMessageResponse {
  data: ThreadMessageData;
  metadata: ResponseMetadata;
}

export async function threadMessage(
  context: ThreadMessageContext,
  request: ThreadMessageRequest
): Promise<ThreadMessageResponse> {
  try {
    if (context.debug) {
      console.debug(
        'TenxGraphClient: Fetching thread message',
        `thread: ${request.threadId}`,
        `message: ${request.messageId}`
      );
    }

    const url = `${context.baseUrl}/v1/threads/${encodePathSegment(request.threadId)}/messages/${encodePathSegment(request.messageId)}`;

    const response = await fetchWithTimeout(context, url, {
      method: 'GET',
      headers: buildHeaders(context as RequestContext, {
        'Content-Type': 'application/json',
      }),
      ...getRequestCredentials(context as RequestContext),
    });

    if (!response.ok) {
      console.warn(`TenxGraphClient: Thread message fetch failed with HTTP ${response.status}`);
      const error = await createErrorFromResponse(
        response,
        'Thread message fetch failed',
        '/v1/threads/{thread_id}/messages/{message_id}',
        'GET'
      );
      throw error;
    }

    const data: ThreadMessageResponse = await response.json();

    if (context.debug) {
      console.info('TenxGraphClient: Thread message fetched successfully', data);
    }

    return data;
  } catch (error) {
    if (context.debug) {
      console.debug('TenxGraphClient: Thread message fetch failed:', error);
    }
    throw error;
  }
}
