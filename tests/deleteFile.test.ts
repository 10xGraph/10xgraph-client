import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { deleteFile } from '../src/endpoints/deleteFile';
import type { DeleteFileContext, DeleteFileResponse } from '../src/endpoints/deleteFile';
import { TenxGraphClient } from '../src/client';

// Mock fetch globally
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('Delete File Endpoint Tests', () => {
  let mockContext: DeleteFileContext;
  const mockResponse: DeleteFileResponse = {
    data: { file_id: 'file-abc', deleted: true },
    metadata: {
      request_id: 'f2e2147709b64caca391441256666d68',
      timestamp: '2025-10-26T00:44:22.910508',
      message: 'Success',
    },
  };

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

  describe('Successful delete', () => {
    it('should return success response with correct structure', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(mockResponse) });

      const result = await deleteFile(mockContext, 'file-abc');

      expect(result).toEqual(mockResponse);
      expect(result.data.file_id).toBe('file-abc');
      expect(result.data.deleted).toBe(true);
      expect(result.metadata.message).toBe('Success');
    });

    it('should call correct URL and method with headers and no body', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(mockResponse) });

      await deleteFile(mockContext, 'file-abc');

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:8000/v1/files/file-abc');
      expect(options.method).toBe('DELETE');
      expect(options.headers['accept']).toBe('application/json');
      expect(options.headers['Authorization']).toBe('Bearer test-token');
      expect(options.body).toBeUndefined();
    });

    it('should URL-encode the file id', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(mockResponse) });

      await deleteFile(mockContext, 'a/b c');

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:8000/v1/files/a%2Fb%20c');
    });

    it('should omit Authorization header when no token', async () => {
      const ctx: DeleteFileContext = { ...mockContext, authToken: null };
      fetchMock.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(mockResponse) });

      await deleteFile(ctx, 'file-abc');

      const [, options] = fetchMock.mock.calls[0];
      expect(options.headers['Authorization']).toBeUndefined();
    });
  });

  describe('Error handling', () => {
    it('should throw on 404', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 404 });
      await expect(deleteFile(mockContext, 'file-abc')).rejects.toThrow();
    });

    it('should throw on 401', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 401 });
      await expect(deleteFile(mockContext, 'file-abc')).rejects.toThrow();
    });

    it('should throw on 403', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 403 });
      await expect(deleteFile(mockContext, 'file-abc')).rejects.toThrow();
    });

    it('should timeout', async () => {
      const slowContext = { ...mockContext, timeout: 50 };
      fetchMock.mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new DOMException('AbortError', 'AbortError')), 100);
          })
      );
      await expect(deleteFile(slowContext, 'file-abc')).rejects.toThrow(
        'Request timeout after 50ms'
      );
    });

    it('should handle network error', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'));
      await expect(deleteFile(mockContext, 'file-abc')).rejects.toThrow('Network error');
    });
  });

  describe('Debug logging', () => {
    it('should log when debug is true', async () => {
      const ctx = { ...mockContext, debug: true };
      const debugSpy = vi.spyOn(console, 'debug');
      const infoSpy = vi.spyOn(console, 'info');

      fetchMock.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(mockResponse) });

      await deleteFile(ctx, 'file-abc');

      expect(debugSpy).toHaveBeenCalled();
      expect(infoSpy).toHaveBeenCalledWith(
        'TenxGraphClient: File deleted successfully',
        mockResponse
      );
    });
  });

  describe('TenxGraphClient wrapper', () => {
    it('should call DELETE /v1/files/{file_id} through client.deleteFile', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(mockResponse) });
      const client = new TenxGraphClient({
        baseUrl: 'http://localhost:8000',
        authToken: 'test-token',
      });

      const result = await client.deleteFile('file-abc');

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:8000/v1/files/file-abc');
      expect(options.method).toBe('DELETE');
      expect(result).toEqual(mockResponse);
    });

    it('should propagate a 404 from client.deleteFile', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 404 });
      const client = new TenxGraphClient({ baseUrl: 'http://localhost:8000' });
      await expect(client.deleteFile('missing')).rejects.toThrow();
    });
  });
});
