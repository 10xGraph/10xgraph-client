import { ResponseMetadata } from './metadata.js';
import { ThreadMessageData } from './threadMessage.js';
import { createErrorFromResponse } from '../errors.js';
import {
  buildHeaders,
  getRequestCredentials,
  RequestContext,
  fetchWithTimeout,
  encodePathSegment,
} from '../request.js';

export interface UpdateThreadMessageFeedbackContext extends RequestContext {}

export interface UpdateThreadMessageFeedbackRequest {
  threadId: string | number;
  messageId: string;
  /**
   * Any JSON object. Replaces `message.metadata.feedback`. The server rejects
   * feedback larger than 8192 serialized bytes or nested deeper than 10 levels (HTTP 422).
   */
  feedback: Record<string, unknown>;
}

export interface UpdateThreadMessageFeedbackResponse {
  data: ThreadMessageData;
  metadata: ResponseMetadata;
}

export async function updateThreadMessageFeedback(
  context: UpdateThreadMessageFeedbackContext,
  request: UpdateThreadMessageFeedbackRequest
): Promise<UpdateThreadMessageFeedbackResponse> {
  try {
    if (context.debug) {
      console.debug(
        'TenxGraphClient: Updating thread message feedback',
        `thread: ${request.threadId}`,
        `message: ${request.messageId}`
      );
    }

    const url = `${context.baseUrl}/v1/threads/${encodePathSegment(request.threadId)}/messages/${encodePathSegment(request.messageId)}`;

    const response = await fetchWithTimeout(context, url, {
      method: 'PUT',
      headers: buildHeaders(context as RequestContext, {
        'Content-Type': 'application/json',
        accept: 'application/json',
      }),
      ...getRequestCredentials(context as RequestContext),
      body: JSON.stringify({ feedback: request.feedback }),
    });

    if (!response.ok) {
      console.warn(
        `TenxGraphClient: Update thread message feedback failed with HTTP ${response.status}`
      );
      const error = await createErrorFromResponse(
        response,
        'Update thread message feedback failed',
        '/v1/threads/{thread_id}/messages/{message_id}',
        'PUT'
      );
      throw error;
    }

    const data: UpdateThreadMessageFeedbackResponse = await response.json();

    if (context.debug) {
      console.info('TenxGraphClient: Thread message feedback updated successfully', data);
    }

    return data;
  } catch (error) {
    if (context.debug) {
      console.debug('TenxGraphClient: Update thread message feedback failed:', error);
    }
    throw error;
  }
}
