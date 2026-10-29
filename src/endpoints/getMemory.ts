import { ResponseMetadata } from './metadata.js';
import { createErrorFromResponse } from '../errors.js';
import {
  buildHeaders,
  getRequestCredentials,
  RequestContext,
  fetchWithTimeout,
  encodePathSegment,
} from '../request.js';
import { MemoryResult } from './searchMemory.js';

export interface GetMemoryContext extends RequestContext {}

export interface GetMemoryRequest {
  memoryId: string;
  config?: Record<string, any>;
  options?: Record<string, any>;
}

export interface GetMemoryData {
  memory: MemoryResult;
}

export interface GetMemoryResponse {
  data: GetMemoryData;
  metadata: ResponseMetadata;
}

export async function getMemory(
  context: GetMemoryContext,
  request: GetMemoryRequest
): Promise<GetMemoryResponse> {
  try {
    if (context.debug) {
      console.debug('TenxGraphClient: Fetching memory with ID:', request.memoryId);
    }

    const url = `${context.baseUrl}/v1/store/memories/${encodePathSegment(request.memoryId)}`;

    // Prepare request body
    const body = {
      config: request.config || {},
      options: request.options || {},
    };

    const response = await fetchWithTimeout(context, url, {
      method: 'POST',
      headers: buildHeaders(context as RequestContext, {
        'Content-Type': 'application/json',
      }),
      ...getRequestCredentials(context as RequestContext),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.warn(`TenxGraphClient: Get memory failed with HTTP ${response.status}`);
      const error = await createErrorFromResponse(
        response,
        'Get memory request failed',
        '/v1/memory/{memory_id}',
        'GET'
      );
      throw error;
    }

    const data: GetMemoryResponse = await response.json();

    if (context.debug) {
      console.info('TenxGraphClient: Memory fetched successfully', {
        memory_id: request.memoryId,
        content: data.data.memory.content.substring(0, 50),
      });
    }

    return data;
  } catch (error) {
    if (context.debug) {
      console.debug('TenxGraphClient: Get memory failed:', error);
    }
    throw error;
  }
}
