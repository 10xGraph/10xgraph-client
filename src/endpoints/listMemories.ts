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
  /** Memories to skip, for paging. Use `next_offset` from the previous page. Needs 10xgraph-api with paging support. */
  offset?: number;
}

export interface ListMemoriesData {
  memories: MemoryResult[];
  /** True when more memories follow this page. Absent on servers without paging. */
  has_more?: boolean;
  /** Offset to request next, or null on the last page. */
  next_offset?: number | null;
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
    // `offset` is sent only when given, so a call without it matches older servers.
    const body: Record<string, unknown> = {
      config: request.config || {},
      options: request.options || {},
      limit: request.limit || 100,
    };
    if (request.offset !== undefined) {
      body.offset = request.offset;
    }

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
