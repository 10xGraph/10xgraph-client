import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { threadMessage } from '../src/endpoints/threadMessage';
import type {
  ThreadMessageContext,
  ThreadMessageRequest,
  ThreadMessageResponse,
} from '../src/endpoints/threadMessage';
import { Message, TextBlock } from '../src/message';

// Mock fetch globally
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('Thread Message Endpoint Tests', () => {
  let mockContext: ThreadMessageContext;
  let mockRequest: ThreadMessageRequest;

  beforeEach(() => {
    mockContext = {
      baseUrl: 'http://localhost:8000',
      authToken: 'test-token',
      timeout: 5000,
      debug: false,
    };

    mockRequest = {
      threadId: 5,
      messageId: '39dff7f2-b300-465a-82a3-3985b7c8bc81',
    };

    // Reset mocks
    fetchMock.mockReset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Successful thread message fetch', () => {
    it('should return thread message response with correct structure', async () => {
      const mockMessage = new Message('user', [
        { type: 'text', text: 'HI', annotations: [] } as TextBlock,
      ]);
      mockMessage.message_id = '39dff7f2-b300-465a-82a3-3985b7c8bc81';
      mockMessage.timestamp = 1761301570.507072;

      const mockResponse: ThreadMessageResponse = {
        data: mockMessage as any,
        metadata: {
          request_id: '3dd8d66c-e9eb-4a2f-ac43-4548dab7b510',
          timestamp: '2025-10-24T16:34:26.333220',
          message: 'OK',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      const result = await threadMessage(mockContext, mockRequest);

      expect(result).toEqual(mockResponse);
      expect(result.data.message_id).toBe('39dff7f2-b300-465a-82a3-3985b7c8bc81');
      expect(result.data.role).toBe('user');
      expect(result.metadata.request_id).toBe('3dd8d66c-e9eb-4a2f-ac43-4548dab7b510');
    });

    it('should construct correct URL with thread and message IDs', async () => {
      const mockResponse: ThreadMessageResponse = {
        data: new Message('user', []) as any,
        metadata: {
          request_id: 'test-request-id',
          timestamp: '2025-10-24T16:34:26.333220',
          message: 'OK',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await threadMessage(mockContext, mockRequest);

      const callArgs = fetchMock.mock.calls[0];
      const url = callArgs[0];

      expect(url).toBe(
        'http://localhost:8000/v1/threads/5/messages/39dff7f2-b300-465a-82a3-3985b7c8bc81'
      );
    });

    it('should work with string threadId', async () => {
      const stringThreadRequest: ThreadMessageRequest = {
        threadId: 'thread-abc-123',
        messageId: 'msg-123',
      };

      const mockResponse: ThreadMessageResponse = {
        data: new Message('user', []) as any,
        metadata: {
          request_id: 'test-request-id',
          timestamp: '2025-10-24T16:34:26.333220',
          message: 'OK',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await threadMessage(mockContext, stringThreadRequest);

      const url = fetchMock.mock.calls[0][0];
      expect(url).toBe('http://localhost:8000/v1/threads/thread-abc-123/messages/msg-123');
    });

    it('should work without auth token', async () => {
      const contextWithoutAuth = { ...mockContext, authToken: undefined };

      const mockResponse: ThreadMessageResponse = {
        data: new Message('user', []) as any,
        metadata: {
          request_id: 'test-request-id',
          timestamp: '2025-10-24T16:34:26.333220',
          message: 'OK',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await threadMessage(contextWithoutAuth, mockRequest);

      const headers = fetchMock.mock.calls[0][1].headers;
      expect(headers).not.toHaveProperty('Authorization');
    });

    it('should include auth token in headers when provided', async () => {
      const mockResponse: ThreadMessageResponse = {
        data: new Message('user', []) as any,
        metadata: {
          request_id: 'test-request-id',
          timestamp: '2025-10-24T16:34:26.333220',
          message: 'OK',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await threadMessage(mockContext, mockRequest);

      const headers = fetchMock.mock.calls[0][1].headers;
      expect(headers['Authorization']).toBe('Bearer test-token');
    });

    it('should use GET method', async () => {
      const mockResponse: ThreadMessageResponse = {
        data: new Message('user', []) as any,
        metadata: {
          request_id: 'test-request-id',
          timestamp: '2025-10-24T16:34:26.333220',
          message: 'OK',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await threadMessage(mockContext, mockRequest);

      const method = fetchMock.mock.calls[0][1].method;
      expect(method).toBe('GET');
    });
  });

  describe('Error handling', () => {
    it('should throw error for non-2xx HTTP status (404)', async () => {
      const mockFetchResponse = {
        ok: false,
        status: 404,
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await expect(threadMessage(mockContext, mockRequest)).rejects.toThrow();
    });

    it('should throw error for 500 status', async () => {
      const mockFetchResponse = {
        ok: false,
        status: 500,
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await expect(threadMessage(mockContext, mockRequest)).rejects.toThrow();
    });

    it('should throw error for 401 unauthorized', async () => {
      const mockFetchResponse = {
        ok: false,
        status: 401,
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await expect(threadMessage(mockContext, mockRequest)).rejects.toThrow();
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network connection failed');
      fetchMock.mockRejectedValue(networkError);

      await expect(threadMessage(mockContext, mockRequest)).rejects.toThrow(
        'Network connection failed'
      );
    });

    it('should handle JSON parsing errors', async () => {
      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await expect(threadMessage(mockContext, mockRequest)).rejects.toThrow('Invalid JSON');
    });
  });

  describe('Debug logging', () => {
    let consoleDebugSpy: any;
    let consoleInfoSpy: any;
    let consoleWarnSpy: any;

    beforeEach(() => {
      consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleDebugSpy.mockRestore();
      consoleInfoSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    it('should log debug messages when debug is enabled', async () => {
      const debugContext = { ...mockContext, debug: true };

      const mockResponse: ThreadMessageResponse = {
        data: new Message('user', []) as any,
        metadata: {
          request_id: 'test-request-id',
          timestamp: '2025-10-24T16:34:26.333220',
          message: 'OK',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await threadMessage(debugContext, mockRequest);

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        'TenxGraphClient: Fetching thread message',
        'thread: 5',
        'message: 39dff7f2-b300-465a-82a3-3985b7c8bc81'
      );
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        'TenxGraphClient: Thread message fetched successfully',
        mockResponse
      );
    });

    it('should not log debug messages when debug is disabled', async () => {
      const noDebugContext = { ...mockContext, debug: false };

      const mockResponse: ThreadMessageResponse = {
        data: new Message('user', []) as any,
        metadata: {
          request_id: 'test-request-id',
          timestamp: '2025-10-24T16:34:26.333220',
          message: 'OK',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await threadMessage(noDebugContext, mockRequest);

      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleInfoSpy).not.toHaveBeenCalled();
    });

    it('should log error on failed fetch when debug is enabled', async () => {
      const debugContext = { ...mockContext, debug: true };
      const error = new Error('Network error');

      fetchMock.mockRejectedValue(error);

      await expect(threadMessage(debugContext, mockRequest)).rejects.toThrow('Network error');

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        'TenxGraphClient: Fetching thread message',
        'thread: 5',
        'message: 39dff7f2-b300-465a-82a3-3985b7c8bc81'
      );
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        'TenxGraphClient: Thread message fetch failed:',
        expect.objectContaining({ cause: error })
      );
    });
  });

  describe('Request headers', () => {
    it('should include Content-Type header', async () => {
      const mockResponse: ThreadMessageResponse = {
        data: new Message('user', []) as any,
        metadata: {
          request_id: 'test-request-id',
          timestamp: '2025-10-24T16:34:26.333220',
          message: 'OK',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await threadMessage(mockContext, mockRequest);

      const headers = fetchMock.mock.calls[0][1].headers;
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should include abort signal for timeout', async () => {
      const mockResponse: ThreadMessageResponse = {
        data: new Message('user', []) as any,
        metadata: {
          request_id: 'test-request-id',
          timestamp: '2025-10-24T16:34:26.333220',
          message: 'OK',
        },
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      fetchMock.mockResolvedValue(mockFetchResponse);

      await threadMessage(mockContext, mockRequest);

      const signal = fetchMock.mock.calls[0][1].signal;
      expect(signal).toBeInstanceOf(AbortSignal);
    });
  });
});
