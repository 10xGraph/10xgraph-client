import { ResponseMetadata } from './metadata.js';
import { Message } from '../message.js';
import { createErrorFromResponse } from '../errors.js';
import { buildHeaders, getRequestCredentials, RequestContext } from '../request.js';

export interface ThreadMessagesContext extends RequestContext {}

export interface ThreadMessagesRequest {
  threadId: string | number;
  search?: string;
  offset?: number;
  limit?: number;
}

export interface ThreadMessagesData {
  messages: Message[];
  /** True when more messages exist after this page. Absent on servers older than 1.0.0. */
  has_more?: boolean;
  /** Offset the server applied. */
  offset?: number;
  /** Limit the server applied (after its default and maximum clamp). */
  limit?: number;
}

// Backward compatibility alias
export type CheckpointMessagesData = ThreadMessagesData;

export interface ThreadMessagesResponse {
  data: ThreadMessagesData;
  metadata: ResponseMetadata;
}

// Backward compatibility alias
export type CheckpointMessagesResponse = ThreadMessagesResponse;

export async function threadMessages(
  context: ThreadMessagesContext,
  request: ThreadMessagesRequest
): Promise<ThreadMessagesResponse> {
  try {
    if (context.debug) {
      console.debug('TenxGraphClient: Fetching thread messages for thread', request.threadId);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), context.timeout);

    // Build query parameters
    const params = new URLSearchParams();
    if (request.search !== undefined) {
      params.append('search', request.search);
    }
    if (request.offset !== undefined) {
      params.append('offset', request.offset.toString());
    }
    if (request.limit !== undefined) {
      params.append('limit', request.limit.toString());
    }

    const queryString = params.toString();
    const url = `${context.baseUrl}/v1/threads/${request.threadId}/messages${queryString ? '?' + queryString : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: buildHeaders(context as RequestContext, {
        'Content-Type': 'application/json',
      }),
      ...getRequestCredentials(context as RequestContext),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(
        `TenxGraphClient: Checkpoint messages fetch failed with HTTP ${response.status}`
      );
      const error = await createErrorFromResponse(
        response,
        'Thread messages fetch failed',
        '/v1/threads/{thread_id}/messages',
        'GET'
      );
      throw error;
    }

    const data: ThreadMessagesResponse = await response.json();

    if (context.debug) {
      console.info('TenxGraphClient: Thread messages fetched successfully', data);
    }

    return data;
  } catch (error) {
    if (context.debug) {
      console.debug('TenxGraphClient: Checkpoint messages fetch failed:', error);
    }
    throw error;
  }
}

// Backward compatibility alias
export const checkpointMessages = threadMessages;
