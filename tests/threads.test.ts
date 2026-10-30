import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { threads } from '../src/endpoints/threads';
import type { ThreadsContext, ThreadsRequest, ThreadsResponse } from '../src/endpoints/threads';

// Mock fetch globally
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('Threads Endpoint Tests', () => {
  let mockContext: ThreadsContext;

  beforeEach(() => {
    mockContext = {
      baseUrl: 'http://localhost:8000',
      authToken: 'test-token',
      timeout: 5000,
      debug: false,
    };

    fetchMock.mockReset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Successful fetch', () => {
    it('should return threads list with correct structure', async () => {
      const mockResponse: ThreadsResponse = {
        data: {
          threads: [
            {
              thread_id: '5',
              thread_name: 'Test Thread',
              user_id: 'user-123',
              metadata: { key: 'value' },
              updated_at: '2025-10-26T01:38:12.094988',
              run_id: 'run-456',
            },
          ],
        },
        metadata: {
          request_id: '76794838-1a00-4a0b-8a7e-d2247b1cccef',
          timestamp: '2025-10-26T01:38:12.094988',
          message: 'OK',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      const result = await threads(mockContext);

      expect(result).toEqual(mockResponse);
      expect(result.data.threads).toHaveLength(1);
      expect(result.data.threads[0].thread_id).toBe('5');
    });

    it('should call correct URL with no query parameters', async () => {
      const mockResponse: ThreadsResponse = {
        data: { threads: [] },
        metadata: { request_id: 'id', timestamp: 'ts', message: 'OK' },
      };
      const mockFetchResponse = { ok: true, json: vi.fn().mockResolvedValue(mockResponse) };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await threads(mockContext);

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:8000/v1/threads');
      expect(options.method).toBe('GET');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['accept']).toBe('application/json');
      expect(options.headers['Authorization']).toBe('Bearer test-token');
    });

    it('should include search parameter in URL', async () => {
      const mockResponse: ThreadsResponse = {
        data: { threads: [] },
        metadata: { request_id: 'id', timestamp: 'ts', message: 'OK' },
      };
      const mockFetchResponse = { ok: true, json: vi.fn().mockResolvedValue(mockResponse) };
      fetchMock.mockResolvedValue(mockFetchResponse);

      const request: ThreadsRequest = { search: 'test' };
      await threads(mockContext, request);

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:8000/v1/threads?search=test');
    });

    it('should include offset and limit parameters in URL', async () => {
      const mockResponse: ThreadsResponse = {
        data: { threads: [] },
        metadata: { request_id: 'id', timestamp: 'ts', message: 'OK' },
      };
      const mockFetchResponse = { ok: true, json: vi.fn().mockResolvedValue(mockResponse) };
      fetchMock.mockResolvedValue(mockFetchResponse);

      const request: ThreadsRequest = { offset: 10, limit: 20 };
      await threads(mockContext, request);

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:8000/v1/threads?offset=10&limit=20');
    });

    it('should include all query parameters when provided', async () => {
      const mockResponse: ThreadsResponse = {
        data: { threads: [] },
        metadata: { request_id: 'id', timestamp: 'ts', message: 'OK' },
      };
      const mockFetchResponse = { ok: true, json: vi.fn().mockResolvedValue(mockResponse) };
      fetchMock.mockResolvedValue(mockFetchResponse);

      const request: ThreadsRequest = { search: 's', offset: 0, limit: 10 };
      await threads(mockContext, request);

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:8000/v1/threads?search=s&offset=0&limit=10');
    });

    it('should omit Authorization header when no token', async () => {
      const ctx: ThreadsContext = { ...mockContext, authToken: null };
      const mockResponse: ThreadsResponse = {
        data: { threads: [] },
        metadata: { request_id: 'id', timestamp: 'ts', message: 'OK' },
      };
      const mockFetchResponse = { ok: true, json: vi.fn().mockResolvedValue(mockResponse) };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await threads(ctx);

      const [, options] = fetchMock.mock.calls[0];
      expect(options.headers['Authorization']).toBeUndefined();
    });

    it('should handle empty threads array', async () => {
      const mockResponse: ThreadsResponse = {
        data: { threads: [] },
        metadata: { request_id: 'id', timestamp: 'ts', message: 'OK' },
      };
      const mockFetchResponse = { ok: true, json: vi.fn().mockResolvedValue(mockResponse) };
      fetchMock.mockResolvedValue(mockFetchResponse);

      const result = await threads(mockContext);

      expect(result.data.threads).toHaveLength(0);
    });

    it('should handle multiple threads', async () => {
      const mockResponse: ThreadsResponse = {
        data: {
          threads: [
            {
              thread_id: '1',
              thread_name: 'Thread 1',
              user_id: 'user-1',
              metadata: null,
              updated_at: null,
              run_id: null,
            },
            {
              thread_id: '2',
              thread_name: 'Thread 2',
              user_id: 'user-2',
              metadata: { custom: 'data' },
              updated_at: '2025-10-26T01:38:12.094988',
              run_id: 'run-2',
            },
          ],
        },
        metadata: { request_id: 'id', timestamp: 'ts', message: 'OK' },
      };
      const mockFetchResponse = { ok: true, json: vi.fn().mockResolvedValue(mockResponse) };
      fetchMock.mockResolvedValue(mockFetchResponse);

      const result = await threads(mockContext);

      expect(result.data.threads).toHaveLength(2);
      expect(result.data.threads[0].thread_id).toBe('1');
      expect(result.data.threads[1].thread_id).toBe('2');
    });

    it('should handle threads with null values', async () => {
      const mockResponse: ThreadsResponse = {
        data: {
          threads: [
            {
              thread_id: '5',
              thread_name: null,
              user_id: null,
              metadata: null,
              updated_at: null,
              run_id: null,
            },
          ],
        },
        metadata: { request_id: 'id', timestamp: 'ts', message: 'OK' },
      };
      const mockFetchResponse = { ok: true, json: vi.fn().mockResolvedValue(mockResponse) };
      fetchMock.mockResolvedValue(mockFetchResponse);

      const result = await threads(mockContext);

      expect(result.data.threads[0].thread_name).toBeNull();
      expect(result.data.threads[0].user_id).toBeNull();
      expect(result.data.threads[0].metadata).toBeNull();
    });
  });

  describe('Error handling', () => {
    it('should throw on 404', async () => {
      const mockFetchResponse = { ok: false, status: 404 };
      fetchMock.mockResolvedValue(mockFetchResponse);
      await expect(threads(mockContext)).rejects.toThrow();
    });

    it('should throw on 500', async () => {
      const mockFetchResponse = { ok: false, status: 500 };
      fetchMock.mockResolvedValue(mockFetchResponse);
      await expect(threads(mockContext)).rejects.toThrow();
    });

    it('should throw on 401', async () => {
      const mockFetchResponse = { ok: false, status: 401 };
      fetchMock.mockResolvedValue(mockFetchResponse);
      await expect(threads(mockContext)).rejects.toThrow();
    });

    it('should throw on 403', async () => {
      const mockFetchResponse = { ok: false, status: 403 };
      fetchMock.mockResolvedValue(mockFetchResponse);
      await expect(threads(mockContext)).rejects.toThrow();
    });

    it('should timeout when request takes too long', async () => {
      const slowContext = { ...mockContext, timeout: 50 };
      fetchMock.mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new DOMException('AbortError', 'AbortError')), 100);
          })
      );
      await expect(threads(slowContext)).rejects.toThrow('Request timeout after 50ms');
    });

    it('should handle network error', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'));
      await expect(threads(mockContext)).rejects.toThrow('Network error');
    });

    it('should handle fetch abortion correctly', async () => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      fetchMock.mockRejectedValue(error);
      await expect(threads(mockContext)).rejects.toThrow('Request timeout after 5000ms');
    });
  });

  describe('Debug logging', () => {
    it('should log debug messages when debug is true', async () => {
      const debugContext = { ...mockContext, debug: true };
      const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      const mockResponse: ThreadsResponse = {
        data: {
          threads: [
            {
              thread_id: '1',
              thread_name: 'Test',
              user_id: null,
              metadata: null,
              updated_at: null,
              run_id: null,
            },
          ],
        },
        metadata: { request_id: 'id', timestamp: 'ts', message: 'OK' },
      };
      const mockFetchResponse = { ok: true, json: vi.fn().mockResolvedValue(mockResponse) };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await threads(debugContext, { search: 'test', offset: 0, limit: 10 });

      expect(consoleDebugSpy).toHaveBeenCalledWith('TenxGraphClient: Fetching threads list');
      expect(consoleDebugSpy).toHaveBeenCalledWith('  Search: test');
      expect(consoleDebugSpy).toHaveBeenCalledWith('  Offset: 0');
      expect(consoleDebugSpy).toHaveBeenCalledWith('  Limit: 10');
      expect(consoleInfoSpy).toHaveBeenCalled();
      expect(consoleDebugSpy).toHaveBeenCalledWith('  Found 1 threads');

      consoleDebugSpy.mockRestore();
      consoleInfoSpy.mockRestore();
    });

    it('should not log debug messages when debug is false', async () => {
      const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      const mockResponse: ThreadsResponse = {
        data: { threads: [] },
        metadata: { request_id: 'id', timestamp: 'ts', message: 'OK' },
      };
      const mockFetchResponse = { ok: true, json: vi.fn().mockResolvedValue(mockResponse) };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await threads(mockContext);

      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleInfoSpy).not.toHaveBeenCalled();

      consoleDebugSpy.mockRestore();
      consoleInfoSpy.mockRestore();
    });

    it('should log warning on HTTP error', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const mockFetchResponse = { ok: false, status: 404 };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await expect(threads(mockContext)).rejects.toThrow();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'TenxGraphClient: Threads list fetch failed with HTTP 404'
      );

      consoleWarnSpy.mockRestore();
    });

    it('should log timeout warning', async () => {
      const slowContext = { ...mockContext, timeout: 50 };
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      fetchMock.mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new DOMException('AbortError', 'AbortError')), 100);
          })
      );

      await expect(threads(slowContext)).rejects.toMatchObject({
        name: 'RequestTimeoutError',
        message: 'Request timeout after 50ms',
      });

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Signal handling', () => {
    it('should clear timeout on successful response', async () => {
      const mockResponse: ThreadsResponse = {
        data: { threads: [] },
        metadata: { request_id: 'id', timestamp: 'ts', message: 'OK' },
      };
      const mockFetchResponse = { ok: true, json: vi.fn().mockResolvedValue(mockResponse) };
      fetchMock.mockResolvedValue(mockFetchResponse);

      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      await threads(mockContext);

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it('should pass abort signal to fetch', async () => {
      const mockResponse: ThreadsResponse = {
        data: { threads: [] },
        metadata: { request_id: 'id', timestamp: 'ts', message: 'OK' },
      };
      const mockFetchResponse = { ok: true, json: vi.fn().mockResolvedValue(mockResponse) };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await threads(mockContext);

      const [, options] = fetchMock.mock.calls[0];
      expect(options.signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe('Query parameter handling', () => {
    it('should handle special characters in search parameter', async () => {
      const mockResponse: ThreadsResponse = {
        data: { threads: [] },
        metadata: { request_id: 'id', timestamp: 'ts', message: 'OK' },
      };
      const mockFetchResponse = { ok: true, json: vi.fn().mockResolvedValue(mockResponse) };
      fetchMock.mockResolvedValue(mockFetchResponse);

      const request: ThreadsRequest = { search: 'test & special' };
      await threads(mockContext, request);

      const [url] = fetchMock.mock.calls[0];
      expect(url).toContain('search=test+%26+special');
    });

    it('should handle offset of 0', async () => {
      const mockResponse: ThreadsResponse = {
        data: { threads: [] },
        metadata: { request_id: 'id', timestamp: 'ts', message: 'OK' },
      };
      const mockFetchResponse = { ok: true, json: vi.fn().mockResolvedValue(mockResponse) };
      fetchMock.mockResolvedValue(mockFetchResponse);

      const request: ThreadsRequest = { offset: 0 };
      await threads(mockContext, request);

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:8000/v1/threads?offset=0');
    });

    it('should not include undefined parameters', async () => {
      const mockResponse: ThreadsResponse = {
        data: { threads: [] },
        metadata: { request_id: 'id', timestamp: 'ts', message: 'OK' },
      };
      const mockFetchResponse = { ok: true, json: vi.fn().mockResolvedValue(mockResponse) };
      fetchMock.mockResolvedValue(mockFetchResponse);

      const request: ThreadsRequest = { search: 'test', offset: undefined, limit: undefined };
      await threads(mockContext, request);

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:8000/v1/threads?search=test');
    });
  });
});
