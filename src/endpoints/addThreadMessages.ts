import { ResponseMetadata } from './metadata.js';
import { Message } from '../message.js';
import { createErrorFromResponse } from '../errors.js';
import { buildHeaders, getRequestCredentials, RequestContext } from '../request.js';

export interface AddThreadMessagesContext extends RequestContext {}

export interface AddThreadMessagesRequest {
  threadId: string | number;
  config: Record<string, any>;
  messages: Message[];
  metadata?: Record<string, any>;
}

export interface AddThreadMessagesData {
  success: boolean;
  message: string;
  data: Record<string, any>;
}

export interface AddThreadMessagesResponse {
  data: AddThreadMessagesData;
  metadata: ResponseMetadata;
}

/**
 * @deprecated Requires the `checkpointer:import` scope (admin only) in 10xgraph-api releases after 0.9.0.
 * Use `updateThreadMessageFeedback` to attach feedback to a message.
 */
export async function addThreadMessages(
  context: AddThreadMessagesContext,
  request: AddThreadMessagesRequest
): Promise<AddThreadMessagesResponse> {
  try {
    if (context.debug) {
      console.debug('TenxGraphClient: Adding thread messages to thread', request.threadId);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), context.timeout);

    const url = `${context.baseUrl}/v1/threads/${request.threadId}/messages`;

    // Prepare request body
    const body = {
      config: request.config,
      messages: request.messages,
      metadata: request.metadata || {},
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(context as RequestContext, {
        'Content-Type': 'application/json',
      }),
      ...getRequestCredentials(context as RequestContext),
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`TenxGraphClient: Add checkpoint messages failed with HTTP ${response.status}`);
      const error = await createErrorFromResponse(
        response,
        'Add thread messages failed',
        '/v1/threads/{thread_id}/messages',
        'POST'
      );
      throw error;
    }

    const data: AddThreadMessagesResponse = await response.json();

    if (context.debug) {
      console.info('TenxGraphClient: Thread messages added successfully', data);
    }

    return data;
  } catch (error) {
    if (context.debug) {
      console.debug('TenxGraphClient: Add checkpoint messages failed:', error);
    }
    throw error;
  }
}
