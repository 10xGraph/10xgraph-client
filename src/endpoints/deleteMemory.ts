import { ResponseMetadata } from './metadata.js';
import { createErrorFromResponse } from '../errors.js';
import {
  buildHeaders,
  getRequestCredentials,
  RequestContext,
  fetchWithTimeout,
  encodePathSegment,
} from '../request.js';

export interface DeleteMemoryContext extends RequestContext {}

export interface DeleteMemoryRequest {
  memoryId: string;
  config?: Record<string, any>;
  options?: Record<string, any>;
}

export interface DeleteMemoryData {
  success: boolean;
  data: string;
}

export interface DeleteMemoryResponse {
  data: DeleteMemoryData;
  metadata: ResponseMetadata;
}

export async function deleteMemory(
  context: DeleteMemoryContext,
  request: DeleteMemoryRequest
): Promise<DeleteMemoryResponse> {
  try {
    if (context.debug) {
      console.debug('TenxGraphClient: Deleting memory with ID:', request.memoryId);
    }

    const url = `${context.baseUrl}/v1/store/memories/${encodePathSegment(request.memoryId)}`;

    // Prepare request body
    const body = {
      config: request.config || {},
      options: request.options || {},
    };

    if (context.debug) {
      console.debug('TenxGraphClient: Delete request payload:', JSON.stringify(body, null, 2));
    }

    const response = await fetchWithTimeout(context, url, {
      method: 'DELETE',
      headers: buildHeaders(context as RequestContext, {
        'Content-Type': 'application/json',
        accept: 'application/json',
      }),
      ...getRequestCredentials(context as RequestContext),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.warn(`TenxGraphClient: Delete memory failed with HTTP ${response.status}`);
      const error = await createErrorFromResponse(
        response,
        'Delete memory request failed',
        '/v1/memory/{memory_id}',
        'DELETE'
      );
      throw error;
    }

    const data: DeleteMemoryResponse = await response.json();

    if (context.debug) {
      console.info('TenxGraphClient: Memory deleted successfully', {
        memory_id: request.memoryId,
        success: data.data.success,
      });
    }

    return data;
  } catch (error) {
    if (context.debug) {
      console.debug('TenxGraphClient: Delete memory failed:', error);
    }
    throw error;
  }
}
