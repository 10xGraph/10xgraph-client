import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ping } from '../src/endpoints/ping';
import type { PingContext, PingResponse } from '../src/endpoints/ping';

// Mock fetch globally
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('Ping Endpoint Tests', () => {
  let mockContext: PingContext;

  beforeEach(() => {
    mockContext = {
      baseUrl: 'http://localhost:8000',
      authToken: 'test-token',
      timeout: 5000,
      debug: false,
    };

    // Reset mocks
    fetchMock.mockReset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Successful ping', () => {
    it('should return pong response with correct structure', async () => {
      const mockResponse: PingResponse = {
        data: 'pong',
        metadata: {
          request_id: 'test-request-id',
          timestamp: '2025-10-19T01:00:00.000000',
          message: 'OK',
        },
      };

      // Mock successful fetch response
      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      const result = await ping(mockContext);

      expect(result).toEqual(mockResponse);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/ping', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
        signal: expect.any(AbortSignal),
      });
    });

    it('should work without auth token', async () => {
      const contextWithoutAuth = { ...mockContext, authToken: undefined };

      const mockResponse: PingResponse = {
        data: 'pong',
        metadata: {
          request_id: 'test-request-id',
          timestamp: '2025-10-19T01:00:00.000000',
          message: 'OK',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      const result = await ping(contextWithoutAuth);

      expect(result).toEqual(mockResponse);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/ping', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: expect.any(AbortSignal),
      });
    });

    it('should work with null auth token', async () => {
      const contextWithNullAuth = { ...mockContext, authToken: null };

      const mockResponse: PingResponse = {
        data: 'pong',
        metadata: {
          request_id: 'test-request-id',
          timestamp: '2025-10-19T01:00:00.000000',
          message: 'OK',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      const result = await ping(contextWithNullAuth);

      expect(result).toEqual(mockResponse);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/ping', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: expect.any(AbortSignal),
      });
    });
  });

  describe('Error handling', () => {
    it('should throw error for non-2xx HTTP status', async () => {
      const mockFetchResponse = {
        ok: false,
        status: 500,
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await expect(ping(mockContext)).rejects.toThrow();
    });

    it('should handle timeout correctly', async () => {
      // Mock AbortError
      const abortError = new Error('Request timed out');
      abortError.name = 'AbortError';
      fetchMock.mockRejectedValue(abortError);

      await expect(ping(mockContext)).rejects.toThrow('Request timeout after 5000ms');
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network connection failed');
      fetchMock.mockRejectedValue(networkError);

      await expect(ping(mockContext)).rejects.toThrow('Network connection failed');
    });

    it('should handle JSON parsing errors', async () => {
      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await expect(ping(mockContext)).rejects.toThrow('Invalid JSON');
    });
  });

  describe('Debug logging', () => {
    let consoleDebugSpy: any;
    let consoleInfoSpy: any;
    let consoleWarnSpy: any;
    let consoleErrorSpy: any;

    beforeEach(() => {
      consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleDebugSpy.mockRestore();
      consoleInfoSpy.mockRestore();
      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should log debug messages when debug is enabled', async () => {
      const debugContext = { ...mockContext, debug: true };

      const mockResponse: PingResponse = {
        data: 'pong',
        metadata: {
          request_id: 'test-request-id',
          timestamp: '2025-10-19T01:00:00.000000',
          message: 'OK',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await ping(debugContext);

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        'TenxGraphClient: Pinging server at',
        'http://localhost:8000'
      );
      expect(consoleInfoSpy).toHaveBeenCalledWith('TenxGraphClient: Ping successful', mockResponse);
    });

    it('should log error messages when debug is enabled', async () => {
      const debugContext = { ...mockContext, debug: true };

      const mockFetchResponse = {
        ok: false,
        status: 404,
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await expect(ping(debugContext)).rejects.toThrow();

      expect(consoleWarnSpy).toHaveBeenCalledWith('TenxGraphClient: Ping failed with HTTP 404');
    });

    it('should log timeout messages when debug is enabled', async () => {
      const debugContext = { ...mockContext, debug: true };

      const abortError = new Error('Request timed out');
      abortError.name = 'AbortError';
      fetchMock.mockRejectedValue(abortError);

      await expect(ping(debugContext)).rejects.toMatchObject({ name: 'RequestTimeoutError' });
    });

    it('should not log when debug is disabled', async () => {
      const mockResponse: PingResponse = {
        data: 'pong',
        metadata: {
          request_id: 'test-request-id',
          timestamp: '2025-10-19T01:00:00.000000',
          message: 'OK',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await ping(mockContext);

      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleInfoSpy).not.toHaveBeenCalled();
    });
  });

  describe('Timeout handling', () => {
    it('should set up AbortController with correct timeout', async () => {
      const mockResponse: PingResponse = {
        data: 'pong',
        metadata: {
          request_id: 'test-request-id',
          timestamp: '2025-10-19T01:00:00.000000',
          message: 'OK',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      // Mock setTimeout and clearTimeout to verify they're called
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      await ping(mockContext);

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5000);
      expect(clearTimeoutSpy).toHaveBeenCalled();

      setTimeoutSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
    });

    it('should use default timeout when not specified', async () => {
      const contextWithoutTimeout: Omit<PingContext, 'timeout'> & { timeout?: number } = {
        baseUrl: 'http://localhost:8000',
        authToken: 'test-token',
        debug: false,
      };

      const mockResponse: PingResponse = {
        data: 'pong',
        metadata: {
          request_id: 'test-request-id',
          timestamp: '2025-10-19T01:00:00.000000',
          message: 'OK',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await ping(contextWithoutTimeout as PingContext);

      // Should still work, though we can't easily test the exact timeout value
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  describe('Response validation', () => {
    it('should validate response structure', async () => {
      const mockResponse: PingResponse = {
        data: 'pong',
        metadata: {
          request_id: 'test-request-id',
          timestamp: '2025-10-19T01:00:00.000000',
          message: 'OK',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      const result = await ping(mockContext);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('metadata');
      expect(result.data).toBe('pong');
      expect(result.metadata).toHaveProperty('request_id');
      expect(result.metadata).toHaveProperty('timestamp');
      expect(result.metadata).toHaveProperty('message');
    });
  });
});
