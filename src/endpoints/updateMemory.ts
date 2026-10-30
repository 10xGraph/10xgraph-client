import { ResponseMetadata } from './metadata.js';
import { createErrorFromResponse } from '../errors.js';
import {
  buildHeaders,
  getRequestCredentials,
  RequestContext,
  fetchWithTimeout,
  encodePathSegment,
} from '../request.js';

export interface UpdateMemoryContext extends RequestContext {}

export interface UpdateMemoryRequest {
  memoryId: string;
  config?: Record<string, any>;
  options?: Record<string, any>;
  content: string;
  metadata?: Record<string, any>;
}

export interface UpdateMemoryData {
  success: boolean;
  data: Record<string, any>;
}

export interface UpdateMemoryResponse {
  data: UpdateMemoryData;
  metadata: ResponseMetadata;
}

export async function updateMemory(
  context: UpdateMemoryContext,
  request: UpdateMemoryRequest
): Promise<UpdateMemoryResponse> {
  try {
    if (context.debug) {
      console.debug('TenxGraphClient: Updating memory with ID:', request.memoryId);
    }

    const url = `${context.baseUrl}/v1/store/memories/${encodePathSegment(request.memoryId)}`;

    // Prepare request body
    const body = {
      config: request.config || {},
      options: request.options || {},
      content: request.content,
      metadata: request.metadata || {},
    };

    if (context.debug) {
      console.debug('TenxGraphClient: Request payload:', JSON.stringify(body, null, 2));
    }

    const response = await fetchWithTimeout(context, url, {
      method: 'PUT',
      headers: buildHeaders(context as RequestContext, {
        'Content-Type': 'application/json',
      }),
      ...getRequestCredentials(context as RequestContext),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.warn(`TenxGraphClient: Update memory failed with HTTP ${response.status}`);
      const error = await createErrorFromResponse(
        response,
        'Update memory request failed',
        '/v1/memory/{memory_id}',
        'PUT'
      );
      throw error;
    }

    const data: UpdateMemoryResponse = await response.json();

    if (context.debug) {
      console.info('TenxGraphClient: Memory updated successfully', {
        memory_id: request.memoryId,
        success: data.data.success,
      });
    }

    return data;
  } catch (error) {
    if (context.debug) {
      console.debug('TenxGraphClient: Update memory failed:', error);
    }
    throw error;
  }
}
