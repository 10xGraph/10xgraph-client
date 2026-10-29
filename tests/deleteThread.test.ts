import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { deleteThread } from '../src/endpoints/deleteThread';
import type {
  DeleteThreadContext,
  DeleteThreadRequest,
  DeleteThreadResponse,
} from '../src/endpoints/deleteThread';

// Mock fetch globally
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('Delete Thread Endpoint Tests', () => {
  let mockContext: DeleteThreadContext;
  let mockRequest: DeleteThreadRequest;

  beforeEach(() => {
    mockContext = {
      baseUrl: 'http://localhost:8000',
      authToken: 'test-token',
      timeout: 5000,
      debug: false,
    };

    mockRequest = {
      threadId: 5,
      config: {},
    };

    fetchMock.mockReset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Successful delete', () => {
    it('should return success response with correct structure', async () => {
      const mockResponse: DeleteThreadResponse = {
        data: {
          success: true,
          message: 'Thread deleted successfully',
          data: true,
        },
        metadata: {
          request_id: 'c7fe0175-af50-4b4f-971a-b3a43ee3e552',
          timestamp: '2025-10-26T01:32:32.680953',
          message: 'OK',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      const result = await deleteThread(mockContext, mockRequest);

      expect(result).toEqual(mockResponse);
      expect(result.data.success).toBe(true);
      expect(result.data.data).toBe(true);
      expect(result.metadata.message).toBe('OK');
    });

    it('should call correct URL and method with headers and body', async () => {
      const mockResponse: DeleteThreadResponse = {
        data: { success: true, message: 'Thread deleted successfully', data: true },
        metadata: { request_id: 'id', timestamp: 'ts', message: 'OK' },
      };
      const mockFetchResponse = { ok: true, json: vi.fn().mockResolvedValue(mockResponse) };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await deleteThread(mockContext, mockRequest);

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:8000/v1/threads/5');
      expect(options.method).toBe('DELETE');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['accept']).toBe('application/json');
      expect(options.headers['Authorization']).toBe('Bearer test-token');
      const body = JSON.parse(options.body);
      expect(body).toEqual({ config: {} });
    });

    it('should work with string threadId', async () => {
      const req: DeleteThreadRequest = { threadId: 't-5', config: {} };
      const mockResponse: DeleteThreadResponse = {
        data: { success: true, message: 'Thread deleted successfully', data: true },
        metadata: { request_id: 'id', timestamp: 'ts', message: 'OK' },
      };
      const mockFetchResponse = { ok: true, json: vi.fn().mockResolvedValue(mockResponse) };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await deleteThread(mockContext, req);

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:8000/v1/threads/t-5');
    });

    it('should work with numeric threadId', async () => {
      const req: DeleteThreadRequest = { threadId: 42, config: {} };
      const mockResponse: DeleteThreadResponse = {
        data: { success: true, message: 'Thread deleted successfully', data: true },
        metadata: { request_id: 'id', timestamp: 'ts', message: 'OK' },
      };
      const mockFetchResponse = { ok: true, json: vi.fn().mockResolvedValue(mockResponse) };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await deleteThread(mockContext, req);

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:8000/v1/threads/42');
    });

    it('should omit Authorization header when no token', async () => {
      const ctx: DeleteThreadContext = { ...mockContext, authToken: null };
      const mockResponse: DeleteThreadResponse = {
        data: { success: true, message: 'Thread deleted successfully', data: true },
        metadata: { request_id: 'id', timestamp: 'ts', message: 'OK' },
      };
      const mockFetchResponse = { ok: true, json: vi.fn().mockResolvedValue(mockResponse) };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await deleteThread(ctx, mockRequest);

      const [, options] = fetchMock.mock.calls[0];
      expect(options.headers['Authorization']).toBeUndefined();
    });

    it('should send custom config in request body', async () => {
      const req: DeleteThreadRequest = {
        threadId: 5,
        config: { customKey: 'customValue', nested: { data: true } },
      };
      const mockResponse: DeleteThreadResponse = {
        data: { success: true, message: 'Thread deleted successfully', data: true },
        metadata: { request_id: 'id', timestamp: 'ts', message: 'OK' },
      };
      const mockFetchResponse = { ok: true, json: vi.fn().mockResolvedValue(mockResponse) };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await deleteThread(mockContext, req);

      const [, options] = fetchMock.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.config).toEqual({ customKey: 'customValue', nested: { data: true } });
    });

    it('should use empty object when config is undefined', async () => {
      const req: DeleteThreadRequest = { threadId: 5 };
      const mockResponse: DeleteThreadResponse = {
        data: { success: true, message: 'Thread deleted successfully', data: true },
        metadata: { request_id: 'id', timestamp: 'ts', message: 'OK' },
      };
      const mockFetchResponse = { ok: true, json: vi.fn().mockResolvedValue(mockResponse) };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await deleteThread(mockContext, req);

      const [, options] = fetchMock.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.config).toEqual({});
    });
  });

  describe('Error handling', () => {
    it('should throw on 404', async () => {
      const mockFetchResponse = { ok: false, status: 404 };
      fetchMock.mockResolvedValue(mockFetchResponse);
      await expect(deleteThread(mockContext, mockRequest)).rejects.toThrow();
    });

    it('should throw on 500', async () => {
      const mockFetchResponse = { ok: false, status: 500 };
      fetchMock.mockResolvedValue(mockFetchResponse);
      await expect(deleteThread(mockContext, mockRequest)).rejects.toThrow();
    });

    it('should throw on 401', async () => {
      const mockFetchResponse = { ok: false, status: 401 };
      fetchMock.mockResolvedValue(mockFetchResponse);
      await expect(deleteThread(mockContext, mockRequest)).rejects.toThrow();
    });

    it('should throw on 403', async () => {
      const mockFetchResponse = { ok: false, status: 403 };
      fetchMock.mockResolvedValue(mockFetchResponse);
      await expect(deleteThread(mockContext, mockRequest)).rejects.toThrow();
    });

    it('should timeout when request takes too long', async () => {
      const slowContext = { ...mockContext, timeout: 50 };
      fetchMock.mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new DOMException('AbortError', 'AbortError')), 100);
          })
      );
      await expect(deleteThread(slowContext, mockRequest)).rejects.toThrow(
        'Request timeout after 50ms'
      );
    });

    it('should handle network error', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'));
      await expect(deleteThread(mockContext, mockRequest)).rejects.toThrow('Network error');
    });

    it('should handle fetch abortion correctly', async () => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      fetchMock.mockRejectedValue(error);
      await expect(deleteThread(mockContext, mockRequest)).rejects.toThrow(
        'Request timeout after 5000ms'
      );
    });
  });

  describe('Debug logging', () => {
    it('should log debug messages when debug is true', async () => {
      const debugContext = { ...mockContext, debug: true };
      const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      const mockResponse: DeleteThreadResponse = {
        data: { success: true, message: 'Thread deleted successfully', data: true },
        metadata: { request_id: 'id', timestamp: 'ts', message: 'OK' },
      };
      const mockFetchResponse = { ok: true, json: vi.fn().mockResolvedValue(mockResponse) };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await deleteThread(debugContext, mockRequest);

      expect(consoleDebugSpy).toHaveBeenCalledWith('TenxGraphClient: Deleting thread', 'thread: 5');
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        'TenxGraphClient: Thread deleted successfully',
        mockResponse
      );

      consoleDebugSpy.mockRestore();
      consoleInfoSpy.mockRestore();
    });

    it('should not log debug messages when debug is false', async () => {
      const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      const mockResponse: DeleteThreadResponse = {
        data: { success: true, message: 'Thread deleted successfully', data: true },
        metadata: { request_id: 'id', timestamp: 'ts', message: 'OK' },
      };
      const mockFetchResponse = { ok: true, json: vi.fn().mockResolvedValue(mockResponse) };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await deleteThread(mockContext, mockRequest);

      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleInfoSpy).not.toHaveBeenCalled();

      consoleDebugSpy.mockRestore();
      consoleInfoSpy.mockRestore();
    });

    it('should log warning on HTTP error', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const mockFetchResponse = { ok: false, status: 404 };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await expect(deleteThread(mockContext, mockRequest)).rejects.toThrow();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'TenxGraphClient: Delete thread failed with HTTP 404'
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

      await expect(deleteThread(slowContext, mockRequest)).rejects.toMatchObject({
        name: 'RequestTimeoutError',
        message: 'Request timeout after 50ms',
      });

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Signal handling', () => {
    it('should clear timeout on successful response', async () => {
      const mockResponse: DeleteThreadResponse = {
        data: { success: true, message: 'Thread deleted successfully', data: true },
        metadata: { request_id: 'id', timestamp: 'ts', message: 'OK' },
      };
      const mockFetchResponse = { ok: true, json: vi.fn().mockResolvedValue(mockResponse) };
      fetchMock.mockResolvedValue(mockFetchResponse);

      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      await deleteThread(mockContext, mockRequest);

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it('should pass abort signal to fetch', async () => {
      const mockResponse: DeleteThreadResponse = {
        data: { success: true, message: 'Thread deleted successfully', data: true },
        metadata: { request_id: 'id', timestamp: 'ts', message: 'OK' },
      };
      const mockFetchResponse = { ok: true, json: vi.fn().mockResolvedValue(mockResponse) };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await deleteThread(mockContext, mockRequest);

      const [, options] = fetchMock.mock.calls[0];
      expect(options.signal).toBeInstanceOf(AbortSignal);
    });
  });
});
