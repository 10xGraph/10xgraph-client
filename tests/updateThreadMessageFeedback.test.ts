import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { updateThreadMessageFeedback } from '../src/endpoints/updateThreadMessageFeedback';
import type {
  UpdateThreadMessageFeedbackContext,
  UpdateThreadMessageFeedbackRequest,
  UpdateThreadMessageFeedbackResponse,
} from '../src/endpoints/updateThreadMessageFeedback';
import { TenxGraphClient } from '../src/client';

// Mock fetch globally
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('Update Thread Message Feedback Endpoint Tests', () => {
  let mockContext: UpdateThreadMessageFeedbackContext;
  let mockRequest: UpdateThreadMessageFeedbackRequest;
  let mockResponse: UpdateThreadMessageFeedbackResponse;

  beforeEach(() => {
    mockContext = {
      baseUrl: 'http://localhost:8000',
      authToken: 'test-token',
      timeout: 5000,
      debug: false,
    };

    mockRequest = {
      threadId: 5,
      messageId: '58788989',
      feedback: { rating: 'up', comment: 'helpful' },
    };

    mockResponse = {
      data: {
        message_id: '58788989',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello', annotations: [] }],
        metadata: { feedback: { rating: 'up', comment: 'helpful' } },
      } as any,
      metadata: {
        request_id: 'f2e2147709b64caca391441256666d68',
        timestamp: '2025-10-26T00:44:22.910508',
        message: 'Success',
      },
    };

    fetchMock.mockReset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Successful update', () => {
    it('should return the updated message', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(mockResponse) });

      const result = await updateThreadMessageFeedback(mockContext, mockRequest);

      expect(result).toEqual(mockResponse);
    });

    it('should PUT the feedback body to the message URL', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(mockResponse) });

      await updateThreadMessageFeedback(mockContext, mockRequest);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:8000/v1/threads/5/messages/58788989');
      expect(options.method).toBe('PUT');
      expect(options.headers['Authorization']).toBe('Bearer test-token');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(options.body)).toEqual({ feedback: { rating: 'up', comment: 'helpful' } });
    });

    it('should accept a string thread ID', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(mockResponse) });

      await updateThreadMessageFeedback(mockContext, { ...mockRequest, threadId: 't-5' });

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:8000/v1/threads/t-5/messages/58788989');
    });

    it('should omit Authorization header when no token', async () => {
      const ctx: UpdateThreadMessageFeedbackContext = { ...mockContext, authToken: null };
      fetchMock.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(mockResponse) });

      await updateThreadMessageFeedback(ctx, mockRequest);

      const [, options] = fetchMock.mock.calls[0];
      expect(options.headers['Authorization']).toBeUndefined();
    });
  });

  describe('Error handling', () => {
    it.each([401, 404, 422, 501, 500])('should throw on %i', async (status) => {
      fetchMock.mockResolvedValue({ ok: false, status });
      await expect(updateThreadMessageFeedback(mockContext, mockRequest)).rejects.toThrow();
    });

    it('should timeout', async () => {
      const slowContext = { ...mockContext, timeout: 50 };
      fetchMock.mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new DOMException('AbortError', 'AbortError')), 100);
          })
      );
      await expect(updateThreadMessageFeedback(slowContext, mockRequest)).rejects.toThrow(
        'Request timeout after 50ms'
      );
    });

    it('should handle network error', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'));
      await expect(updateThreadMessageFeedback(mockContext, mockRequest)).rejects.toThrow(
        'Network error'
      );
    });
  });

  describe('Debug logging', () => {
    it('should log when debug is true', async () => {
      const ctx = { ...mockContext, debug: true };
      const debugSpy = vi.spyOn(console, 'debug');
      const infoSpy = vi.spyOn(console, 'info');
      fetchMock.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(mockResponse) });

      await updateThreadMessageFeedback(ctx, mockRequest);

      expect(debugSpy).toHaveBeenCalled();
      expect(infoSpy).toHaveBeenCalledWith(
        'TenxGraphClient: Thread message feedback updated successfully',
        mockResponse
      );
    });
  });

  describe('Client wrapper', () => {
    it('should call the endpoint via TenxGraphClient.updateThreadMessageFeedback', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(mockResponse) });
      const client = new TenxGraphClient({ baseUrl: 'http://localhost:8000', authToken: 'tok' });

      const result = await client.updateThreadMessageFeedback('t-1', 'm-1', { score: 1 });

      expect(result).toEqual(mockResponse);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:8000/v1/threads/t-1/messages/m-1');
      expect(options.method).toBe('PUT');
      expect(JSON.parse(options.body)).toEqual({ feedback: { score: 1 } });
    });
  });
});
