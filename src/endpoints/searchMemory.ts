import { ResponseMetadata } from './metadata.js';
import { createErrorFromResponse } from '../errors.js';
import { buildHeaders, getRequestCredentials, RequestContext } from '../request.js';
import { MemoryType } from './storeMemory.js';

export interface SearchMemoryContext extends RequestContext {}

/**
 * Memory retrieval strategies
 */
export enum RetrievalStrategy {
  SIMILARITY = 'similarity', // Vector similarity search
  TEMPORAL = 'temporal', // Time-based retrieval
  RELEVANCE = 'relevance', // Relevance scoring
  HYBRID = 'hybrid', // Combined approaches
  GRAPH_TRAVERSAL = 'graph_traversal', // Knowledge graph navigation
}

/**
 * Supported distance metrics for vector similarity
 */
export enum DistanceMetric {
  COSINE = 'cosine',
  EUCLIDEAN = 'euclidean',
  DOT_PRODUCT = 'dot_product',
  MANHATTAN = 'manhattan',
}

export interface SearchMemoryRequest {
  config?: Record<string, any>;
  options?: Record<string, any>;
  query: string;
  memory_type?: MemoryType;
  category?: string;
  limit?: number;
  score_threshold?: number;
  filters?: Record<string, any>;
  retrieval_strategy?: RetrievalStrategy;
  distance_metric?: DistanceMetric;
  max_tokens?: number;
}

export interface MemoryResult {
  id: string;
  content: string;
  score: number;
  memory_type: string;
  metadata: Record<string, any>;
  vector: number[];
  user_id: string;
  thread_id: string;
  timestamp: string;
}

export interface SearchMemoryData {
  results: MemoryResult[];
}

export interface SearchMemoryResponse {
  data: SearchMemoryData;
  metadata: ResponseMetadata;
}

export async function searchMemory(
  context: SearchMemoryContext,
  request: SearchMemoryRequest
): Promise<SearchMemoryResponse> {
  try {
    if (context.debug) {
      console.debug('TenxGraphClient: Searching memories with query:', request.query);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), context.timeout);

    const url = `${context.baseUrl}/v1/store/search`;

    // Prepare request body. memory_type, category and score_threshold have no default:
    // when unset they are omitted so the server applies no filter on them.
    const body: Record<string, unknown> = {
      config: request.config || {},
      options: request.options || {},
      query: request.query,
      limit: request.limit !== undefined ? request.limit : 10,
      filters: request.filters || {},
      retrieval_strategy: request.retrieval_strategy || RetrievalStrategy.SIMILARITY,
      distance_metric: request.distance_metric || DistanceMetric.COSINE,
      max_tokens: request.max_tokens !== undefined ? request.max_tokens : 4000,
    };
    if (request.memory_type !== undefined && request.memory_type !== null) {
      body.memory_type = request.memory_type;
    }
    if (request.category !== undefined && request.category !== null) {
      body.category = request.category;
    }
    if (request.score_threshold !== undefined && request.score_threshold !== null) {
      body.score_threshold = request.score_threshold;
    }

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
      console.warn(`TenxGraphClient: Search memory failed with HTTP ${response.status}`);
      const error = await createErrorFromResponse(
        response,
        'Search memory request failed',
        '/v1/memory/search',
        'POST'
      );
      throw error;
    }

    const data: SearchMemoryResponse = await response.json();

    if (context.debug) {
      console.info('TenxGraphClient: Memory search successful', {
        query: request.query,
        results_count: data.data.results.length,
      });
    }

    return data;
  } catch (error) {
    if (context.debug) {
      console.debug('TenxGraphClient: Search memory failed:', error);
    }
    throw error;
  }
}
