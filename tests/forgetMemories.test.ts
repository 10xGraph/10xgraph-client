import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  forgetMemories,
  ForgetMemoriesContext,
  ForgetMemoriesRequest,
} from '../src/endpoints/forgetMemories';
import { MemoryType } from '../src/endpoints/storeMemory';

describe('forgetMemories', () => {
  let context: ForgetMemoriesContext;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    context = {
      baseUrl: 'https://api.example.com',
      authToken: 'test-token',
      timeout: 5000,
      debug: false,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Successful Forget Operations', () => {
    it('should successfully forget memories with all parameters', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: {
            forgotten_count: 10,
            affected_threads: ['thread-1', 'thread-2'],
          },
        },
        metadata: {
          message: 'Successfully forgot 10 memories',
          request_id: 'req-123',
          timestamp: Date.now(),
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const request: ForgetMemoriesRequest = {
        memory_type: MemoryType.EPISODIC,
        category: 'temporary',
        filters: { tag: 'delete-me' },
        config: { soft_delete: false },
        options: { backup: false },
      };

      const result = await forgetMemories(context, request);

      expect(result).toEqual(mockResponse);

      // Verify the call was made with correct structure
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/v1/store/memories/forget',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
        })
      );

      // Verify body contains all expected fields (order doesn't matter)
      const callArgs = mockFetch.mock.calls[0][1];
      const bodyObject = JSON.parse(callArgs.body);
      expect(bodyObject).toMatchObject({
        memory_type: MemoryType.EPISODIC,
        category: 'temporary',
        filters: { tag: 'delete-me' },
        config: { soft_delete: false },
        options: { backup: false },
      });
    });

    it('should successfully forget memories with only memory_type', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: {
            forgotten_count: 5,
          },
        },
        metadata: {
          message: 'Successfully forgot 5 memories',
          request_id: 'req-124',
          timestamp: Date.now(),
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const request: ForgetMemoriesRequest = {
        memory_type: MemoryType.SEMANTIC,
      };

      const result = await forgetMemories(context, request);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/v1/store/memories/forget',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            memory_type: MemoryType.SEMANTIC,
          }),
        })
      );
    });

    it('should successfully forget memories with only category', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: {
            forgotten_count: 3,
          },
        },
        metadata: {
          message: 'Successfully forgot 3 memories',
          request_id: 'req-125',
          timestamp: Date.now(),
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const request: ForgetMemoriesRequest = {
        category: 'test-category',
      };

      const result = await forgetMemories(context, request);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/v1/store/memories/forget',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            category: 'test-category',
          }),
        })
      );
    });

    it('should successfully forget memories with filters only', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: {
            forgotten_count: 7,
          },
        },
        metadata: {
          message: 'Successfully forgot 7 memories',
          request_id: 'req-126',
          timestamp: Date.now(),
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const request: ForgetMemoriesRequest = {
        filters: { thread_id: 'thread-123', tag: 'temporary' },
      };

      const result = await forgetMemories(context, request);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/v1/store/memories/forget',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            filters: { thread_id: 'thread-123', tag: 'temporary' },
          }),
        })
      );
    });

    it('should successfully forget memories with empty request body', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: {
            forgotten_count: 0,
          },
        },
        metadata: {
          message: 'No memories matched criteria',
          request_id: 'req-127',
          timestamp: Date.now(),
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const request: ForgetMemoriesRequest = {};

      const result = await forgetMemories(context, request);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/v1/store/memories/forget',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({}),
        })
      );
    });
  });

  describe('HTTP Method and Headers', () => {
    it('should use POST method', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: { forgotten_count: 1 },
        },
        metadata: {
          message: 'Success',
          request_id: 'req-128',
          timestamp: Date.now(),
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      await forgetMemories(context, { memory_type: MemoryType.EPISODIC });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should include authorization header when authToken is provided', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: { forgotten_count: 1 },
        },
        metadata: {
          message: 'Success',
          request_id: 'req-129',
          timestamp: Date.now(),
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      await forgetMemories(context, {});

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });

    it('should not include authorization header when authToken is not provided', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: { forgotten_count: 1 },
        },
        metadata: {
          message: 'Success',
          request_id: 'req-130',
          timestamp: Date.now(),
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const contextWithoutAuth = { ...context, authToken: undefined };
      await forgetMemories(contextWithoutAuth, {});

      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.headers).not.toHaveProperty('Authorization');
    });

    it('should include Content-Type header', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: { forgotten_count: 1 },
        },
        metadata: {
          message: 'Success',
          request_id: 'req-131',
          timestamp: Date.now(),
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      await forgetMemories(context, {});

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 Not Found errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      await expect(forgetMemories(context, { memory_type: MemoryType.EPISODIC })).rejects.toThrow(
        'Forget memories failed: 404 Not Found'
      );
    });

    it('should handle 400 Bad Request errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      await expect(forgetMemories(context, { filters: { invalid: 'filter' } })).rejects.toThrow(
        'Forget memories failed: 400 Bad Request'
      );
    });

    it('should handle 500 Internal Server Error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      await expect(forgetMemories(context, {})).rejects.toThrow(
        'Forget memories failed: 500 Internal Server Error'
      );
    });

    it('should handle 401 Unauthorized errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      await expect(forgetMemories(context, {})).rejects.toThrow(
        'Forget memories failed: 401 Unauthorized'
      );
    });

    it('should handle 403 Forbidden errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      await expect(forgetMemories(context, {})).rejects.toThrow(
        'Forget memories failed: 403 Forbidden'
      );
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(forgetMemories(context, {})).rejects.toThrow('Network error');
    });

    it('should handle timeout errors', async () => {
      mockFetch.mockRejectedValueOnce(new DOMException('The operation was aborted.', 'AbortError'));

      await expect(forgetMemories(context, {})).rejects.toThrow('Request timeout after');
    });
  });

  describe('Timeout Handling', () => {
    it('should respect timeout configuration', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: { forgotten_count: 1 },
        },
        metadata: {
          message: 'Success',
          request_id: 'req-132',
          timestamp: Date.now(),
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const contextWithTimeout = { ...context, timeout: 10000 };
      await forgetMemories(contextWithTimeout, {});

      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.signal).toBeDefined();
    });

    it('should not set timeout when timeout is 0', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: { forgotten_count: 1 },
        },
        metadata: {
          message: 'Success',
          request_id: 'req-133',
          timestamp: Date.now(),
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const contextNoTimeout = { ...context, timeout: 0 };
      await forgetMemories(contextNoTimeout, {});

      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.signal.aborted).toBe(false);
    });
  });

  describe('Debug Logging', () => {
    it('should log debug information when debug is true', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const mockResponse = {
        data: {
          success: true,
          data: { forgotten_count: 5 },
        },
        metadata: {
          message: 'Success',
          request_id: 'req-134',
          timestamp: Date.now(),
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const debugContext = { ...context, debug: true };
      await forgetMemories(debugContext, { memory_type: MemoryType.EPISODIC });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG] Forget memories request:'),
        expect.any(Object)
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG] Forget memories response:'),
        mockResponse
      );

      consoleLogSpy.mockRestore();
    });

    it('should not log debug information when debug is false', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const mockResponse = {
        data: {
          success: true,
          data: { forgotten_count: 1 },
        },
        metadata: {
          message: 'Success',
          request_id: 'req-135',
          timestamp: Date.now(),
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      await forgetMemories(context, {});

      expect(consoleLogSpy).not.toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });
  });

  describe('Integration with Different Memory Types', () => {
    it('should forget EPISODIC memories', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: { forgotten_count: 3 },
        },
        metadata: {
          message: 'Success',
          request_id: 'req-136',
          timestamp: Date.now(),
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const result = await forgetMemories(context, {
        memory_type: MemoryType.EPISODIC,
      });

      expect(result.data.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ memory_type: MemoryType.EPISODIC }),
        })
      );
    });

    it('should forget SEMANTIC memories', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: { forgotten_count: 2 },
        },
        metadata: {
          message: 'Success',
          request_id: 'req-137',
          timestamp: Date.now(),
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const result = await forgetMemories(context, {
        memory_type: MemoryType.SEMANTIC,
      });

      expect(result.data.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ memory_type: MemoryType.SEMANTIC }),
        })
      );
    });

    it('should forget PROCEDURAL memories', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: { forgotten_count: 1 },
        },
        metadata: {
          message: 'Success',
          request_id: 'req-138',
          timestamp: Date.now(),
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const result = await forgetMemories(context, {
        memory_type: MemoryType.PROCEDURAL,
      });

      expect(result.data.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ memory_type: MemoryType.PROCEDURAL }),
        })
      );
    });
  });

  describe('Complex Filtering Scenarios', () => {
    it('should handle complex filter combinations', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: {
            forgotten_count: 15,
            affected_threads: ['thread-1', 'thread-2', 'thread-3'],
          },
        },
        metadata: {
          message: 'Success',
          request_id: 'req-139',
          timestamp: Date.now(),
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const complexFilters = {
        thread_id: 'thread-123',
        tag: 'temporary',
        importance: 'low',
        created_before: '2024-01-01',
      };

      const result = await forgetMemories(context, {
        memory_type: MemoryType.EPISODIC,
        category: 'test-data',
        filters: complexFilters,
        config: { soft_delete: false, cascade: true },
        options: { backup: true, force: false },
      });

      expect(result.data.success).toBe(true);
      expect(result.data.data.forgotten_count).toBe(15);

      // Verify body contains all expected fields (order doesn't matter)
      const callArgs = mockFetch.mock.calls[0][1];
      const bodyObject = JSON.parse(callArgs.body);
      expect(bodyObject).toMatchObject({
        memory_type: MemoryType.EPISODIC,
        category: 'test-data',
        filters: complexFilters,
        config: { soft_delete: false, cascade: true },
        options: { backup: true, force: false },
      });
    });

    it('should handle forgetting by thread_id only', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: {
            forgotten_count: 20,
          },
        },
        metadata: {
          message: 'Success',
          request_id: 'req-140',
          timestamp: Date.now(),
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const result = await forgetMemories(context, {
        filters: { thread_id: 'thread-to-forget' },
      });

      expect(result.data.success).toBe(true);
      expect(result.data.data.forgotten_count).toBe(20);
    });
  });
});
