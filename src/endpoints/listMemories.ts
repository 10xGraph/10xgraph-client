import { ResponseMetadata } from './metadata.js';
import { createErrorFromResponse } from '../errors.js';
import {
  buildHeaders,
  getRequestCredentials,
  RequestContext,
  fetchWithTimeout,
} from '../request.js';
import { MemoryResult } from './searchMemory.js';

export interface ListMemoriesContext extends RequestContext {}

export interface ListMemoriesRequest {
  config?: Record<string, any>;
  options?: Record<string, any>;
  limit?: number;
}

export interface ListMemoriesData {
  memories: MemoryResult[];
}

export interface ListMemoriesResponse {
  data: ListMemoriesData;
  metadata: ResponseMetadata;
}

export async function listMemories(
  context: ListMemoriesContext,
  request: ListMemoriesRequest
): Promise<ListMemoriesResponse> {
  try {
    if (context.debug) {
      console.debug('TenxGraphClient: Fetching list of memories', {
        limit: request.limit,
      });
    }

    const url = `${context.baseUrl}/v1/store/memories/list`;

    // Prepare request body
    const body = {
      config: request.config || {},
      options: request.options || {},
      limit: request.limit || 100,
    };

    if (context.debug) {
      console.debug(
        'TenxGraphClient: List memories request payload:',
        JSON.stringify(body, null, 2)
      );
    }

    const response = await fetchWithTimeout(context, url, {
      method: 'POST',
      headers: buildHeaders(context as RequestContext, {
        'Content-Type': 'application/json',
        accept: 'application/json',
      }),
      ...getRequestCredentials(context as RequestContext),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.warn(`TenxGraphClient: List memories failed with HTTP ${response.status}`);
      const error = await createErrorFromResponse(
        response,
        'List memories request failed',
        '/v1/memory',
        'GET'
      );
      throw error;
    }

    const data: ListMemoriesResponse = await response.json();

    if (context.debug) {
      console.info('TenxGraphClient: Memories list fetched successfully', {
        count: data.data.memories.length,
        limit: request.limit,
      });
    }

    return data;
  } catch (error) {
    if (context.debug) {
      console.debug('TenxGraphClient: List memories failed:', error);
    }
    throw error;
  }
}
