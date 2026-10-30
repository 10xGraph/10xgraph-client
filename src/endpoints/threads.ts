import { ResponseMetadata } from './metadata.js';
import { createErrorFromResponse } from '../errors.js';
import {
  buildHeaders,
  getRequestCredentials,
  RequestContext,
  fetchWithTimeout,
} from '../request.js';

export interface ThreadsContext extends RequestContext {}

export interface ThreadsRequest {
  search?: string;
  offset?: number;
  limit?: number;
}

export interface ThreadItem {
  thread_id: string;
  thread_name: string | null;
  user_id: string | null;
  metadata: Record<string, any> | null;
  updated_at: string | null;
  run_id: string | null;
}

export interface ThreadsData {
  threads: ThreadItem[];
  /** True when more threads exist after this page. Absent on servers older than 1.0.0. */
  has_more?: boolean;
  /** Offset the server applied. */
  offset?: number;
  /** Limit the server applied (after its default and maximum clamp). */
  limit?: number;
}

export interface ThreadsResponse {
  data: ThreadsData;
  metadata: ResponseMetadata;
}

/**
 * Fetch list of threads with optional search and pagination
 * GET /v1/threads
 */
export async function threads(
  context: ThreadsContext,
  request?: ThreadsRequest
): Promise<ThreadsResponse> {
  try {
    if (context.debug) {
      console.debug('TenxGraphClient: Fetching threads list');
      if (request?.search) {
        console.debug(`  Search: ${request.search}`);
      }
      if (request?.offset !== undefined) {
        console.debug(`  Offset: ${request.offset}`);
      }
      if (request?.limit !== undefined) {
        console.debug(`  Limit: ${request.limit}`);
      }
    }

    // Build query parameters
    const params = new URLSearchParams();
    if (request?.search) {
      params.append('search', request.search);
    }
    if (request?.offset !== undefined) {
      params.append('offset', request.offset.toString());
    }
    if (request?.limit !== undefined) {
      params.append('limit', request.limit.toString());
    }

    const queryString = params.toString();
    const url = `${context.baseUrl}/v1/threads${queryString ? `?${queryString}` : ''}`;

    const response = await fetchWithTimeout(context, url, {
      method: 'GET',
      headers: buildHeaders(context as RequestContext, {
        'Content-Type': 'application/json',
        accept: 'application/json',
      }),
      ...getRequestCredentials(context as RequestContext),
    });

    if (!response.ok) {
      console.warn(`TenxGraphClient: Threads list fetch failed with HTTP ${response.status}`);
      const error = await createErrorFromResponse(
        response,
        'Threads list fetch failed',
        '/v1/threads',
        'GET'
      );
      throw error;
    }

    const data: ThreadsResponse = await response.json();

    if (context.debug) {
      console.info('TenxGraphClient: Threads list fetched successfully', data);
      console.debug(`  Found ${data.data.threads.length} threads`);
    }

    return data;
  } catch (error) {
    if (context.debug) {
      console.debug('TenxGraphClient: Threads list fetch failed:', error);
    }
    throw error;
  }
}
