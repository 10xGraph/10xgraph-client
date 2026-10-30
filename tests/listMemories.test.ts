import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listMemories } from '../src/endpoints/listMemories';
import type {
  ListMemoriesContext,
  ListMemoriesRequest,
  ListMemoriesResponse,
} from '../src/endpoints/listMemories';
import type { MemoryResult } from '../src/endpoints/searchMemory';

// Mock fetch globally
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('List Memories Endpoint Tests', () => {
  let mockContext: ListMemoriesContext;
  let mockRequest: ListMemoriesRequest;

  beforeEach(() => {
    mockContext = {
      baseUrl: 'http://localhost:8000',
      authToken: 'test-token',
      timeout: 5000,
      debug: false,
    };

    mockRequest = {
      config: {},
      options: {},
      limit: 100,
    };

    // Reset mocks
    fetchMock.mockReset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Successful list memories', () => {
    it('should return list of memories with correct structure', async () => {
      const mockMemories: MemoryResult[] = [
        {
          id: 'mem-1',
          content: 'First memory',
          score: 0.95,
          memory_type: 'episodic',
          metadata: { tag: 'important' },
          vector: [0.1, 0.2, 0.3],
          user_id: 'user-123',
          thread_id: 'thread-456',
          timestamp: '2025-10-26T10:54:53.969Z',
        },
        {
          id: 'mem-2',
          content: 'Second memory',
          score: 0.87,
          memory_type: 'semantic',
          metadata: { category: 'facts' },
          vector: [0.4, 0.5, 0.6],
          user_id: 'user-123',
          thread_id: 'thread-456',
          timestamp: '2025-10-26T11:00:00.000Z',
        },
      ];

      const mockResponse: ListMemoriesResponse = {
        data: {
          memories: mockMemories,
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

      const result = await listMemories(mockContext, mockRequest);

      expect(result).toEqual(mockResponse);
      expect(result.data.memories).toHaveLength(2);
      expect(result.data.memories[0].id).toBe('mem-1');
      expect(result.data.memories[1].memory_type).toBe('semantic');
    });

    it('should construct correct URL', async () => {
      const mockResponse: ListMemoriesResponse = {
        data: {
          memories: [],
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

      await listMemories(mockContext, mockRequest);

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/v1/store/memories/list',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should send POST request with correct headers', async () => {
      const mockResponse: ListMemoriesResponse = {
        data: {
          memories: [],
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

      await listMemories(mockContext, mockRequest);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            accept: 'application/json',
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });

    it('should include limit in request body', async () => {
      const mockResponse: ListMemoriesResponse = {
        data: {
          memories: [],
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

      mockRequest.limit = 50;
      await listMemories(mockContext, mockRequest);

      const callArgs = fetchMock.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.limit).toBe(50);
    });

    it('should default to limit 100 if not specified', async () => {
      const mockResponse: ListMemoriesResponse = {
        data: {
          memories: [],
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

      const minimalRequest: ListMemoriesRequest = {};
      await listMemories(mockContext, minimalRequest);

      const callArgs = fetchMock.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.limit).toBe(100);
    });

    it('should include config and options in request body', async () => {
      const mockResponse: ListMemoriesResponse = {
        data: {
          memories: [],
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

      mockRequest.config = { include_vectors: false };
      mockRequest.options = { sort_by: 'timestamp' };

      await listMemories(mockContext, mockRequest);

      const callArgs = fetchMock.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.config).toEqual({ include_vectors: false });
      expect(body.options).toEqual({ sort_by: 'timestamp' });
    });

    it('should work without auth token', async () => {
      const mockResponse: ListMemoriesResponse = {
        data: {
          memories: [],
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

      mockContext.authToken = null;

      await listMemories(mockContext, mockRequest);

      const callArgs = fetchMock.mock.calls[0];
      const headers = callArgs[1].headers;

      expect(headers.Authorization).toBeUndefined();
    });

    it('should handle empty memories array', async () => {
      const mockResponse: ListMemoriesResponse = {
        data: {
          memories: [],
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

      const result = await listMemories(mockContext, mockRequest);

      expect(result.data.memories).toEqual([]);
      expect(result.data.memories).toHaveLength(0);
    });

    it('should handle large number of memories', async () => {
      const mockMemories: MemoryResult[] = Array.from({ length: 100 }, (_, i) => ({
        id: `mem-${i}`,
        content: `Memory content ${i}`,
        score: 0.8 + i / 1000,
        memory_type: 'episodic',
        metadata: {},
        vector: [i * 0.1, i * 0.2],
        user_id: 'user-123',
        thread_id: 'thread-456',
        timestamp: '2025-10-26T10:54:53.969Z',
      }));

      const mockResponse: ListMemoriesResponse = {
        data: {
          memories: mockMemories,
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

      const result = await listMemories(mockContext, mockRequest);

      expect(result.data.memories).toHaveLength(100);
      expect(result.data.memories[0].id).toBe('mem-0');
      expect(result.data.memories[99].id).toBe('mem-99');
    });
  });

  describe('Error handling', () => {
    it('should throw error on 404 not found', async () => {
      const mockFetchResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: vi.fn().mockResolvedValue({
          error: {
            code: 'RESOURCE_NOT_FOUND',
            message: 'Endpoint not found',
          },
        }),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await expect(listMemories(mockContext, mockRequest)).rejects.toThrow();
    });

    it('should throw error on 400 bad request', async () => {
      const mockFetchResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: vi.fn().mockResolvedValue({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Invalid limit parameter',
          },
        }),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await expect(listMemories(mockContext, mockRequest)).rejects.toThrow();
    });

    it('should throw error on 500 status', async () => {
      const mockFetchResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: vi.fn().mockResolvedValue({
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Server error',
          },
        }),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await expect(listMemories(mockContext, mockRequest)).rejects.toThrow();
    });

    it('should throw error on 401 unauthorized', async () => {
      const mockFetchResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: vi.fn().mockResolvedValue({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid credentials',
          },
        }),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await expect(listMemories(mockContext, mockRequest)).rejects.toThrow();
    });

    it('should throw error on 403 forbidden', async () => {
      const mockFetchResponse = {
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: vi.fn().mockResolvedValue({
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied',
          },
        }),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await expect(listMemories(mockContext, mockRequest)).rejects.toThrow();
    });

    it('should handle timeout', async () => {
      mockContext.timeout = 50;

      fetchMock.mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new DOMException('AbortError', 'AbortError')), 100);
          })
      );

      await expect(listMemories(mockContext, mockRequest)).rejects.toThrow(
        'Request timeout after 50ms'
      );
    });

    it('should handle network errors', async () => {
      fetchMock.mockRejectedValue(new Error('Network connection failed'));

      await expect(listMemories(mockContext, mockRequest)).rejects.toThrow(
        'Network connection failed'
      );
    });

    it('should log errors when debug is enabled', async () => {
      const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      mockContext.debug = true;

      fetchMock.mockRejectedValue(new Error('Test error'));

      await expect(listMemories(mockContext, mockRequest)).rejects.toThrow();

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        'TenxGraphClient: List memories failed:',
        expect.any(Error)
      );

      consoleDebugSpy.mockRestore();
    });
  });

  describe('Debug logging', () => {
    it('should log when debug is enabled', async () => {
      const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      mockContext.debug = true;

      const mockResponse: ListMemoriesResponse = {
        data: {
          memories: [
            {
              id: 'mem-1',
              content: 'Test memory',
              score: 0.9,
              memory_type: 'episodic',
              metadata: {},
              vector: [0.1],
              user_id: 'user-1',
              thread_id: 'thread-1',
              timestamp: '2025-10-26T10:54:53.969Z',
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

      await listMemories(mockContext, mockRequest);

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        'TenxGraphClient: Fetching list of memories',
        expect.objectContaining({ limit: 100 })
      );

      expect(consoleInfoSpy).toHaveBeenCalled();

      consoleDebugSpy.mockRestore();
      consoleInfoSpy.mockRestore();
    });

    it('should log request payload when debug is enabled', async () => {
      const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      mockContext.debug = true;

      const mockResponse: ListMemoriesResponse = {
        data: {
          memories: [],
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

      mockRequest.limit = 75;
      await listMemories(mockContext, mockRequest);

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        'TenxGraphClient: List memories request payload:',
        expect.stringContaining('75')
      );

      consoleDebugSpy.mockRestore();
    });

    it('should not log when debug is disabled', async () => {
      const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      mockContext.debug = false;

      const mockResponse: ListMemoriesResponse = {
        data: {
          memories: [],
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

      await listMemories(mockContext, mockRequest);

      expect(consoleDebugSpy).not.toHaveBeenCalled();

      consoleDebugSpy.mockRestore();
    });
  });

  describe('Integration with TenxGraphClient', () => {
    it('should properly integrate with client context', async () => {
      const mockResponse: ListMemoriesResponse = {
        data: {
          memories: [],
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

      const result = await listMemories(mockContext, mockRequest);

      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(Array.isArray(result.data.memories)).toBe(true);
    });

    it('should handle different limit values', async () => {
      const limits = [10, 50, 100, 200, 500];

      for (const limit of limits) {
        const mockResponse: ListMemoriesResponse = {
          data: {
            memories: [],
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
        fetchMock.mockClear();

        mockRequest.limit = limit;
        await listMemories(mockContext, mockRequest);

        const callArgs = fetchMock.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body.limit).toBe(limit);
      }
    });
  });

  describe('Paging', () => {
    const page = (extra: Record<string, unknown> = {}) =>
      new Response(
        JSON.stringify({
          data: { memories: [], has_more: true, next_offset: 2, ...extra },
          metadata: {},
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );

    it('sends offset when given and returns has_more and next_offset', async () => {
      fetchMock.mockResolvedValueOnce(page());

      const result = await listMemories(mockContext, { ...mockRequest, limit: 2, offset: 4 });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.offset).toBe(4);
      expect(body.limit).toBe(2);
      expect(result.data.has_more).toBe(true);
      expect(result.data.next_offset).toBe(2);
    });

    it('omits offset when not given, so older servers see the same body', async () => {
      fetchMock.mockResolvedValueOnce(page());

      await listMemories(mockContext, mockRequest);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect('offset' in body).toBe(false);
    });

    it('sends offset 0 explicitly', async () => {
      fetchMock.mockResolvedValueOnce(page());

      await listMemories(mockContext, { ...mockRequest, offset: 0 });

      expect(JSON.parse(fetchMock.mock.calls[0][1].body).offset).toBe(0);
    });
  });
});
