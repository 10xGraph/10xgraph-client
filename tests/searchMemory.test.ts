import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchMemory } from '../src/endpoints/searchMemory';
import type {
  SearchMemoryContext,
  SearchMemoryRequest,
  SearchMemoryResponse,
} from '../src/endpoints/searchMemory';
import { MemoryType } from '../src/endpoints/storeMemory';
import { RetrievalStrategy, DistanceMetric } from '../src/endpoints/searchMemory';

// Mock fetch globally
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('Search Memory Endpoint Tests', () => {
  let mockContext: SearchMemoryContext;
  let mockRequest: SearchMemoryRequest;

  beforeEach(() => {
    mockContext = {
      baseUrl: 'http://localhost:8000',
      authToken: 'test-token',
      timeout: 5000,
      debug: false,
    };

    mockRequest = {
      query: 'dark mode preferences',
      memory_type: MemoryType.SEMANTIC,
      category: 'preferences',
      limit: 10,
    };

    // Reset mocks
    fetchMock.mockReset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Successful search', () => {
    it('should return search results with correct structure', async () => {
      const mockResponse: SearchMemoryResponse = {
        data: {
          results: [
            {
              id: 'mem-123',
              content: 'User prefers dark mode',
              score: 0.95,
              memory_type: 'semantic',
              metadata: { source: 'user_settings' },
              vector: [0.1, 0.2, 0.3],
              user_id: 'user-1',
              thread_id: 'thread-1',
              timestamp: '2025-10-26T12:00:00.000Z',
            },
          ],
        },
        metadata: {
          request_id: '50009c49f05241938ce738a2199cd38a',
          timestamp: '2025-10-26T12:51:13.040424',
          message: 'Success',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      const result = await searchMemory(mockContext, mockRequest);

      expect(result).toEqual(mockResponse);
      expect(result.data.results).toHaveLength(1);
      expect(result.data.results[0].id).toBe('mem-123');
      expect(result.data.results[0].score).toBe(0.95);
    });

    it('should construct correct URL', async () => {
      const mockResponse: SearchMemoryResponse = {
        data: { results: [] },
        metadata: {
          request_id: 'test-id',
          timestamp: '2025-10-26T12:51:13.040424',
          message: 'Success',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await searchMemory(mockContext, mockRequest);

      const callArgs = fetchMock.mock.calls[0];
      const url = callArgs[0];

      expect(url).toBe('http://localhost:8000/v1/store/search');
    });

    it('should send POST request with correct headers', async () => {
      const mockResponse: SearchMemoryResponse = {
        data: { results: [] },
        metadata: {
          request_id: 'test-id',
          timestamp: '2025-10-26T12:51:13.040424',
          message: 'Success',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await searchMemory(mockContext, mockRequest);

      const callArgs = fetchMock.mock.calls[0];
      const options = callArgs[1];

      expect(options.method).toBe('POST');
      expect(options.headers).toEqual({
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      });
    });

    it('should send correct request body with defaults', async () => {
      const mockResponse: SearchMemoryResponse = {
        data: { results: [] },
        metadata: {
          request_id: 'test-id',
          timestamp: '2025-10-26T12:51:13.040424',
          message: 'Success',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await searchMemory(mockContext, mockRequest);

      const callArgs = fetchMock.mock.calls[0];
      const options = callArgs[1];
      const body = JSON.parse(options.body);

      expect(body).toEqual({
        config: {},
        options: {},
        query: 'dark mode preferences',
        memory_type: 'semantic',
        category: 'preferences',
        limit: 10,
        filters: {},
        retrieval_strategy: 'similarity',
        distance_metric: 'cosine',
        max_tokens: 4000,
      });
    });

    it('should work without auth token', async () => {
      const contextWithoutAuth = { ...mockContext, authToken: undefined };

      const mockResponse: SearchMemoryResponse = {
        data: { results: [] },
        metadata: {
          request_id: 'test-id',
          timestamp: '2025-10-26T12:51:13.040424',
          message: 'Success',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      const result = await searchMemory(contextWithoutAuth, mockRequest);

      expect(result).toEqual(mockResponse);

      const callArgs = fetchMock.mock.calls[0];
      const options = callArgs[1];

      expect(options.headers).toEqual({
        'Content-Type': 'application/json',
      });
    });

    it('should return multiple results', async () => {
      const mockResponse: SearchMemoryResponse = {
        data: {
          results: [
            {
              id: 'mem-1',
              content: 'User prefers dark mode',
              score: 0.95,
              memory_type: 'semantic',
              metadata: {},
              vector: [0.1, 0.2],
              user_id: 'user-1',
              thread_id: 'thread-1',
              timestamp: '2025-10-26T12:00:00.000Z',
            },
            {
              id: 'mem-2',
              content: 'Dark theme enabled',
              score: 0.85,
              memory_type: 'semantic',
              metadata: {},
              vector: [0.2, 0.3],
              user_id: 'user-1',
              thread_id: 'thread-1',
              timestamp: '2025-10-26T11:00:00.000Z',
            },
          ],
        },
        metadata: {
          request_id: 'test-id',
          timestamp: '2025-10-26T12:51:13.040424',
          message: 'Success',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      const result = await searchMemory(mockContext, mockRequest);

      expect(result.data.results).toHaveLength(2);
      expect(result.data.results[0].score).toBeGreaterThan(result.data.results[1].score);
    });
  });

  describe('Different retrieval strategies', () => {
    it('should handle similarity strategy', async () => {
      const similarityRequest: SearchMemoryRequest = {
        query: 'test query',
        retrieval_strategy: RetrievalStrategy.SIMILARITY,
      };

      const mockResponse: SearchMemoryResponse = {
        data: { results: [] },
        metadata: {
          request_id: 'test-id',
          timestamp: '2025-10-26T12:51:13.040424',
          message: 'Success',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await searchMemory(mockContext, similarityRequest);

      const callArgs = fetchMock.mock.calls[0];
      const options = callArgs[1];
      const body = JSON.parse(options.body);

      expect(body.retrieval_strategy).toBe('similarity');
    });

    it('should handle temporal strategy', async () => {
      const temporalRequest: SearchMemoryRequest = {
        query: 'test query',
        retrieval_strategy: RetrievalStrategy.TEMPORAL,
      };

      const mockResponse: SearchMemoryResponse = {
        data: { results: [] },
        metadata: {
          request_id: 'test-id',
          timestamp: '2025-10-26T12:51:13.040424',
          message: 'Success',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await searchMemory(mockContext, temporalRequest);

      const callArgs = fetchMock.mock.calls[0];
      const options = callArgs[1];
      const body = JSON.parse(options.body);

      expect(body.retrieval_strategy).toBe('temporal');
    });

    it('should handle relevance strategy', async () => {
      const relevanceRequest: SearchMemoryRequest = {
        query: 'test query',
        retrieval_strategy: RetrievalStrategy.RELEVANCE,
      };

      const mockResponse: SearchMemoryResponse = {
        data: { results: [] },
        metadata: {
          request_id: 'test-id',
          timestamp: '2025-10-26T12:51:13.040424',
          message: 'Success',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await searchMemory(mockContext, relevanceRequest);

      const callArgs = fetchMock.mock.calls[0];
      const options = callArgs[1];
      const body = JSON.parse(options.body);

      expect(body.retrieval_strategy).toBe('relevance');
    });

    it('should handle hybrid strategy', async () => {
      const hybridRequest: SearchMemoryRequest = {
        query: 'test query',
        retrieval_strategy: RetrievalStrategy.HYBRID,
      };

      const mockResponse: SearchMemoryResponse = {
        data: { results: [] },
        metadata: {
          request_id: 'test-id',
          timestamp: '2025-10-26T12:51:13.040424',
          message: 'Success',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await searchMemory(mockContext, hybridRequest);

      const callArgs = fetchMock.mock.calls[0];
      const options = callArgs[1];
      const body = JSON.parse(options.body);

      expect(body.retrieval_strategy).toBe('hybrid');
    });

    it('should handle graph traversal strategy', async () => {
      const graphRequest: SearchMemoryRequest = {
        query: 'test query',
        retrieval_strategy: RetrievalStrategy.GRAPH_TRAVERSAL,
      };

      const mockResponse: SearchMemoryResponse = {
        data: { results: [] },
        metadata: {
          request_id: 'test-id',
          timestamp: '2025-10-26T12:51:13.040424',
          message: 'Success',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await searchMemory(mockContext, graphRequest);

      const callArgs = fetchMock.mock.calls[0];
      const options = callArgs[1];
      const body = JSON.parse(options.body);

      expect(body.retrieval_strategy).toBe('graph_traversal');
    });
  });

  describe('Different distance metrics', () => {
    it('should handle cosine distance', async () => {
      const cosineRequest: SearchMemoryRequest = {
        query: 'test query',
        distance_metric: DistanceMetric.COSINE,
      };

      const mockResponse: SearchMemoryResponse = {
        data: { results: [] },
        metadata: {
          request_id: 'test-id',
          timestamp: '2025-10-26T12:51:13.040424',
          message: 'Success',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await searchMemory(mockContext, cosineRequest);

      const callArgs = fetchMock.mock.calls[0];
      const options = callArgs[1];
      const body = JSON.parse(options.body);

      expect(body.distance_metric).toBe('cosine');
    });

    it('should handle euclidean distance', async () => {
      const euclideanRequest: SearchMemoryRequest = {
        query: 'test query',
        distance_metric: DistanceMetric.EUCLIDEAN,
      };

      const mockResponse: SearchMemoryResponse = {
        data: { results: [] },
        metadata: {
          request_id: 'test-id',
          timestamp: '2025-10-26T12:51:13.040424',
          message: 'Success',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await searchMemory(mockContext, euclideanRequest);

      const callArgs = fetchMock.mock.calls[0];
      const options = callArgs[1];
      const body = JSON.parse(options.body);

      expect(body.distance_metric).toBe('euclidean');
    });

    it('should handle dot product distance', async () => {
      const dotProductRequest: SearchMemoryRequest = {
        query: 'test query',
        distance_metric: DistanceMetric.DOT_PRODUCT,
      };

      const mockResponse: SearchMemoryResponse = {
        data: { results: [] },
        metadata: {
          request_id: 'test-id',
          timestamp: '2025-10-26T12:51:13.040424',
          message: 'Success',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await searchMemory(mockContext, dotProductRequest);

      const callArgs = fetchMock.mock.calls[0];
      const options = callArgs[1];
      const body = JSON.parse(options.body);

      expect(body.distance_metric).toBe('dot_product');
    });

    it('should handle manhattan distance', async () => {
      const manhattanRequest: SearchMemoryRequest = {
        query: 'test query',
        distance_metric: DistanceMetric.MANHATTAN,
      };

      const mockResponse: SearchMemoryResponse = {
        data: { results: [] },
        metadata: {
          request_id: 'test-id',
          timestamp: '2025-10-26T12:51:13.040424',
          message: 'Success',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await searchMemory(mockContext, manhattanRequest);

      const callArgs = fetchMock.mock.calls[0];
      const options = callArgs[1];
      const body = JSON.parse(options.body);

      expect(body.distance_metric).toBe('manhattan');
    });
  });

  describe('Request parameters', () => {
    it('should handle custom limit', async () => {
      const limitRequest: SearchMemoryRequest = {
        query: 'test query',
        limit: 20,
      };

      const mockResponse: SearchMemoryResponse = {
        data: { results: [] },
        metadata: {
          request_id: 'test-id',
          timestamp: '2025-10-26T12:51:13.040424',
          message: 'Success',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await searchMemory(mockContext, limitRequest);

      const callArgs = fetchMock.mock.calls[0];
      const options = callArgs[1];
      const body = JSON.parse(options.body);

      expect(body.limit).toBe(20);
    });

    it('should handle score threshold', async () => {
      const thresholdRequest: SearchMemoryRequest = {
        query: 'test query',
        score_threshold: 0.75,
      };

      const mockResponse: SearchMemoryResponse = {
        data: { results: [] },
        metadata: {
          request_id: 'test-id',
          timestamp: '2025-10-26T12:51:13.040424',
          message: 'Success',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await searchMemory(mockContext, thresholdRequest);

      const callArgs = fetchMock.mock.calls[0];
      const options = callArgs[1];
      const body = JSON.parse(options.body);

      expect(body.score_threshold).toBe(0.75);
    });

    it('should handle filters', async () => {
      const filterRequest: SearchMemoryRequest = {
        query: 'test query',
        filters: {
          user_id: 'user-123',
          thread_id: 'thread-456',
        },
      };

      const mockResponse: SearchMemoryResponse = {
        data: { results: [] },
        metadata: {
          request_id: 'test-id',
          timestamp: '2025-10-26T12:51:13.040424',
          message: 'Success',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await searchMemory(mockContext, filterRequest);

      const callArgs = fetchMock.mock.calls[0];
      const options = callArgs[1];
      const body = JSON.parse(options.body);

      expect(body.filters).toEqual({
        user_id: 'user-123',
        thread_id: 'thread-456',
      });
    });

    it('should handle max tokens', async () => {
      const tokensRequest: SearchMemoryRequest = {
        query: 'test query',
        max_tokens: 2000,
      };

      const mockResponse: SearchMemoryResponse = {
        data: { results: [] },
        metadata: {
          request_id: 'test-id',
          timestamp: '2025-10-26T12:51:13.040424',
          message: 'Success',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await searchMemory(mockContext, tokensRequest);

      const callArgs = fetchMock.mock.calls[0];
      const options = callArgs[1];
      const body = JSON.parse(options.body);

      expect(body.max_tokens).toBe(2000);
    });

    it('should handle custom config and options', async () => {
      const fullRequest: SearchMemoryRequest = {
        query: 'test query',
        config: { setting: 'value' },
        options: { option: 'test' },
      };

      const mockResponse: SearchMemoryResponse = {
        data: { results: [] },
        metadata: {
          request_id: 'test-id',
          timestamp: '2025-10-26T12:51:13.040424',
          message: 'Success',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await searchMemory(mockContext, fullRequest);

      const callArgs = fetchMock.mock.calls[0];
      const options = callArgs[1];
      const body = JSON.parse(options.body);

      expect(body.config).toEqual({ setting: 'value' });
      expect(body.options).toEqual({ option: 'test' });
    });
  });

  describe('Error handling', () => {
    it('should throw error on non-ok response', async () => {
      const mockErrorResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: vi.fn().mockResolvedValue({
          detail: 'Invalid query',
        }),
      };
      fetchMock.mockResolvedValue(mockErrorResponse);

      await expect(searchMemory(mockContext, mockRequest)).rejects.toThrow();
    });

    it('should throw error on 500 status', async () => {
      const mockErrorResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: vi.fn().mockResolvedValue({
          detail: 'Server error',
        }),
      };
      fetchMock.mockResolvedValue(mockErrorResponse);

      await expect(searchMemory(mockContext, mockRequest)).rejects.toThrow();
    });

    it('should handle network errors', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'));

      await expect(searchMemory(mockContext, mockRequest)).rejects.toThrow('Network error');
    });

    it('should handle timeout', async () => {
      const timeoutContext = { ...mockContext, timeout: 100 };

      fetchMock.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 1000)));

      await expect(searchMemory(timeoutContext, mockRequest)).rejects.toThrow();
    });
  });

  describe('Debug logging', () => {
    it('should log debug messages when debug is enabled', async () => {
      const debugContext = { ...mockContext, debug: true };
      const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      const mockResponse: SearchMemoryResponse = {
        data: {
          results: [
            {
              id: 'mem-1',
              content: 'Test',
              score: 0.9,
              memory_type: 'semantic',
              metadata: {},
              vector: [],
              user_id: 'u1',
              thread_id: 't1',
              timestamp: '2025-10-26T12:00:00Z',
            },
          ],
        },
        metadata: {
          request_id: 'test-id',
          timestamp: '2025-10-26T12:51:13.040424',
          message: 'Success',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await searchMemory(debugContext, mockRequest);

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        'TenxGraphClient: Searching memories with query:',
        'dark mode preferences'
      );
      expect(consoleInfoSpy).toHaveBeenCalledWith('TenxGraphClient: Memory search successful', {
        query: 'dark mode preferences',
        results_count: 1,
      });

      consoleDebugSpy.mockRestore();
      consoleInfoSpy.mockRestore();
    });

    it('should log debug error messages when debug is enabled and request fails', async () => {
      const debugContext = { ...mockContext, debug: true };
      const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      fetchMock.mockRejectedValue(new Error('Network error'));

      await expect(searchMemory(debugContext, mockRequest)).rejects.toThrow();

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        'TenxGraphClient: Search memory failed:',
        expect.any(Error)
      );

      consoleDebugSpy.mockRestore();
    });
  });

  describe('Memory type filtering', () => {
    it('should search episodic memories', async () => {
      const episodicRequest: SearchMemoryRequest = {
        query: 'conversation about python',
        memory_type: MemoryType.EPISODIC,
      };

      const mockResponse: SearchMemoryResponse = {
        data: { results: [] },
        metadata: {
          request_id: 'test-id',
          timestamp: '2025-10-26T12:51:13.040424',
          message: 'Success',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await searchMemory(mockContext, episodicRequest);

      const callArgs = fetchMock.mock.calls[0];
      const options = callArgs[1];
      const body = JSON.parse(options.body);

      expect(body.memory_type).toBe('episodic');
    });

    it('should search procedural memories', async () => {
      const proceduralRequest: SearchMemoryRequest = {
        query: 'how to deploy',
        memory_type: MemoryType.PROCEDURAL,
      };

      const mockResponse: SearchMemoryResponse = {
        data: { results: [] },
        metadata: {
          request_id: 'test-id',
          timestamp: '2025-10-26T12:51:13.040424',
          message: 'Success',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await searchMemory(mockContext, proceduralRequest);

      const callArgs = fetchMock.mock.calls[0];
      const options = callArgs[1];
      const body = JSON.parse(options.body);

      expect(body.memory_type).toBe('procedural');
    });
  });

  describe('Unset filters are omitted', () => {
    it('omits memory_type, category and score_threshold when not given', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ data: { results: [] }, metadata: {} }),
      });

      await searchMemory(mockContext, { query: 'anything' });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).not.toHaveProperty('memory_type');
      expect(body).not.toHaveProperty('category');
      expect(body).not.toHaveProperty('score_threshold');
      expect(body.query).toBe('anything');
    });

    it('still sends explicit values, including a zero threshold and empty category', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ data: { results: [] }, metadata: {} }),
      });

      await searchMemory(mockContext, {
        query: 'q',
        memory_type: MemoryType.EPISODIC,
        category: '',
        score_threshold: 0,
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.memory_type).toBe('episodic');
      expect(body.category).toBe('');
      expect(body.score_threshold).toBe(0);
    });
  });
});
