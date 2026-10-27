import { describe, it, expect } from 'vitest';
import {
  TenxGraphError,
  BadRequestError,
  AuthenticationError,
  PermissionError,
  NotFoundError,
  ConflictError,
  ValidationError,
  ServerError,
  parseErrorResponse,
  createErrorFromResponse,
  ApiErrorResponse,
} from '../src/errors.js';

describe('Error Classes', () => {
  describe('TenxGraphError', () => {
    it('should create base error with all properties', () => {
      const error = new TenxGraphError(
        'Test error',
        400,
        'TEST_ERROR',
        'req-123',
        '2025-10-26T12:00:00Z',
        [{ loc: ['field'], msg: 'Invalid', type: 'value_error' }]
      );

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(TenxGraphError);
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.errorCode).toBe('TEST_ERROR');
      expect(error.requestId).toBe('req-123');
      expect(error.timestamp).toBe('2025-10-26T12:00:00Z');
      expect(error.details).toHaveLength(1);
      expect(error.details[0].loc).toEqual(['field']);
    });

    it('should have proper name', () => {
      const error = new TenxGraphError('Test', 400, 'TEST', 'req-1', '2025-10-26T12:00:00Z');
      expect(error.name).toBe('TenxGraphError');
    });
  });

  describe('BadRequestError', () => {
    it('should create 400 error', () => {
      const error = new BadRequestError('Invalid input', 'req-123', '2025-10-26T12:00:00Z');

      expect(error).toBeInstanceOf(TenxGraphError);
      expect(error).toBeInstanceOf(BadRequestError);
      expect(error.name).toBe('BadRequestError');
      expect(error.statusCode).toBe(400);
      expect(error.errorCode).toBe('BAD_REQUEST');
      expect(error.message).toBe('Invalid input');
    });

    it('should accept details array', () => {
      const details = [
        { loc: ['body', 'name'], msg: 'field required', type: 'value_error.missing' },
      ];
      const error = new BadRequestError('Invalid', 'req-123', '2025-10-26T12:00:00Z', details);
      expect(error.details).toEqual(details);
    });
  });

  describe('AuthenticationError', () => {
    it('should create 401 error', () => {
      const error = new AuthenticationError(
        'Please provide valid credentials',
        'req-123',
        '2025-10-26T12:00:00Z'
      );

      expect(error).toBeInstanceOf(TenxGraphError);
      expect(error).toBeInstanceOf(AuthenticationError);
      expect(error.name).toBe('AuthenticationError');
      expect(error.statusCode).toBe(401);
      expect(error.errorCode).toBe('AUTHENTICATION_FAILED');
    });
  });

  describe('PermissionError', () => {
    it('should create 403 error', () => {
      const error = new PermissionError(
        "You don't have permission to access this resource",
        'req-123',
        '2025-10-26T12:00:00Z'
      );

      expect(error).toBeInstanceOf(TenxGraphError);
      expect(error).toBeInstanceOf(PermissionError);
      expect(error.name).toBe('PermissionError');
      expect(error.statusCode).toBe(403);
      expect(error.errorCode).toBe('PERMISSION_ERROR');
    });
  });

  describe('NotFoundError', () => {
    it('should create 404 error', () => {
      const error = new NotFoundError('Resource not found', 'req-123', '2025-10-26T12:00:00Z');

      expect(error).toBeInstanceOf(TenxGraphError);
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.name).toBe('NotFoundError');
      expect(error.statusCode).toBe(404);
      expect(error.errorCode).toBe('RESOURCE_NOT_FOUND');
    });
  });

  describe('ValidationError', () => {
    it('should create 422 error with validation details', () => {
      const details = [
        {
          loc: ['body', 'name'],
          msg: 'field required',
          type: 'value_error.missing',
        },
      ];
      const error = new ValidationError(
        'Invalid input',
        'req-123',
        '2025-10-26T12:00:00Z',
        details
      );

      expect(error).toBeInstanceOf(TenxGraphError);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.name).toBe('ValidationError');
      expect(error.statusCode).toBe(422);
      expect(error.errorCode).toBe('VALIDATION_ERROR');
      expect(error.details).toEqual(details);
    });
  });

  describe('ServerError', () => {
    it('should create 500 error', () => {
      const error = new ServerError('Internal server error', 'req-123', '2025-10-26T12:00:00Z');

      expect(error).toBeInstanceOf(TenxGraphError);
      expect(error).toBeInstanceOf(ServerError);
      expect(error.name).toBe('ServerError');
      expect(error.statusCode).toBe(500);
      expect(error.errorCode).toBe('INTERNAL_SERVER_ERROR');
    });

    it('should accept custom error code', () => {
      const error = new ServerError(
        'Database error',
        'req-123',
        '2025-10-26T12:00:00Z',
        'DATABASE_ERROR'
      );

      expect(error.errorCode).toBe('DATABASE_ERROR');
    });
  });
});

describe('parseErrorResponse', () => {
  it('should parse valid JSON error response', async () => {
    const apiError: ApiErrorResponse = {
      metadata: {
        message: 'Failed',
        request_id: 'req-123',
        timestamp: '2025-10-26T12:00:00Z',
      },
      error: {
        code: 'BAD_REQUEST',
        message: 'Invalid input',
        details: [],
      },
    };

    const response = new Response(JSON.stringify(apiError), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });

    const parsed = await parseErrorResponse(response);
    expect(parsed).toEqual(apiError);
  });

  it('should return null for non-JSON response', async () => {
    const response = new Response('Plain text error', {
      status: 500,
      headers: { 'content-type': 'text/plain' },
    });

    const parsed = await parseErrorResponse(response);
    expect(parsed).toBeNull();
  });

  it('should return null for invalid JSON', async () => {
    const response = new Response('{ invalid json', {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });

    const parsed = await parseErrorResponse(response);
    expect(parsed).toBeNull();
  });
});

describe('createErrorFromResponse', () => {
  it('should create BadRequestError for 400 status', async () => {
    const apiError: ApiErrorResponse = {
      metadata: {
        message: 'Failed',
        request_id: 'req-123',
        timestamp: '2025-10-26T12:00:00Z',
      },
      error: {
        code: 'BAD_REQUEST',
        message: 'Invalid input, please check the input data for any errors',
        details: [],
      },
    };

    const response = new Response(JSON.stringify(apiError), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });

    const error = await createErrorFromResponse(response);
    expect(error).toBeInstanceOf(BadRequestError);
    expect(error.statusCode).toBe(400);
    expect(error.errorCode).toBe('BAD_REQUEST');
    expect(error.message).toBe('Invalid input, please check the input data for any errors');
    expect(error.requestId).toBe('req-123');
    expect(error.timestamp).toBe('2025-10-26T12:00:00Z');
  });

  it('should create AuthenticationError for 401 status', async () => {
    const apiError: ApiErrorResponse = {
      metadata: {
        message: 'Failed',
        request_id: 'req-456',
        timestamp: '2025-10-26T12:00:00Z',
      },
      error: {
        code: 'AUTHENTICATION_FAILED',
        message: 'Please provide valid credentials',
        details: [],
      },
    };

    const response = new Response(JSON.stringify(apiError), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });

    const error = await createErrorFromResponse(response);
    expect(error).toBeInstanceOf(AuthenticationError);
    expect(error.statusCode).toBe(401);
    expect(error.message).toBe('Please provide valid credentials');
  });

  it('should create PermissionError for 403 status', async () => {
    const apiError: ApiErrorResponse = {
      metadata: {
        message: 'Failed',
        request_id: 'req-789',
        timestamp: '2025-10-26T12:00:00Z',
      },
      error: {
        code: 'PERMISSION_ERROR',
        message: "You don't have permission to access this resource",
        details: [],
      },
    };

    const response = new Response(JSON.stringify(apiError), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });

    const error = await createErrorFromResponse(response);
    expect(error).toBeInstanceOf(PermissionError);
    expect(error.statusCode).toBe(403);
  });

  it('should create NotFoundError for 404 status', async () => {
    const apiError: ApiErrorResponse = {
      metadata: {
        message: 'Failed',
        request_id: 'req-101',
        timestamp: '2025-10-26T12:00:00Z',
      },
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'Resource not found',
        details: [],
      },
    };

    const response = new Response(JSON.stringify(apiError), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });

    const error = await createErrorFromResponse(response);
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.statusCode).toBe(404);
  });

  it('should create ValidationError for 422 status with details', async () => {
    const apiError: ApiErrorResponse = {
      metadata: {
        message: 'Failed',
        request_id: 'req-202',
        timestamp: '2025-10-26T12:00:00Z',
      },
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: [
          {
            loc: ['body', 'name'],
            msg: 'field required',
            type: 'value_error.missing',
          },
        ],
      },
    };

    const response = new Response(JSON.stringify(apiError), {
      status: 422,
      headers: { 'content-type': 'application/json' },
    });

    const error = await createErrorFromResponse(response);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.statusCode).toBe(422);
    expect(error.details).toHaveLength(1);
    expect(error.details[0].loc).toEqual(['body', 'name']);
  });

  it('should create ServerError for 500 status', async () => {
    const apiError: ApiErrorResponse = {
      metadata: {
        message: 'Failed',
        request_id: 'req-303',
        timestamp: '2025-10-26T12:00:00Z',
      },
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
        details: [],
      },
    };

    const response = new Response(JSON.stringify(apiError), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });

    const error = await createErrorFromResponse(response);
    expect(error).toBeInstanceOf(ServerError);
    expect(error.statusCode).toBe(500);
  });

  it('should handle 502, 503, 504 as ServerError', async () => {
    for (const status of [502, 503, 504]) {
      const apiError: ApiErrorResponse = {
        metadata: {
          message: 'Failed',
          request_id: `req-${status}`,
          timestamp: '2025-10-26T12:00:00Z',
        },
        error: {
          code: 'SERVER_ERROR',
          message: `Server error ${status}`,
          details: [],
        },
      };

      const response = new Response(JSON.stringify(apiError), {
        status,
        headers: { 'content-type': 'application/json' },
      });

      const error = await createErrorFromResponse(response);
      expect(error).toBeInstanceOf(ServerError);
      expect(error.statusCode).toBe(status);
    }
  });

  it('should use fallback message when response has no body', async () => {
    const response = new Response(null, {
      status: 400,
      headers: { 'content-type': 'text/plain' },
    });

    const error = await createErrorFromResponse(response, 'Custom fallback message');
    expect(error).toBeInstanceOf(BadRequestError);
    expect(error.message).toBe('Custom fallback message');
    expect(error.requestId).toBe('unknown');
  });

  it('should handle unknown status codes', async () => {
    const apiError: ApiErrorResponse = {
      metadata: {
        message: 'Failed',
        request_id: 'req-999',
        timestamp: '2025-10-26T12:00:00Z',
      },
      error: {
        code: 'UNKNOWN_ERROR',
        message: 'Something went wrong',
        details: [],
      },
    };

    const response = new Response(JSON.stringify(apiError), {
      status: 418, // I'm a teapot
      headers: { 'content-type': 'application/json' },
    });

    const error = await createErrorFromResponse(response);
    expect(error).toBeInstanceOf(TenxGraphError);
    expect(error.statusCode).toBe(418);
    expect(error.errorCode).toBe('UNKNOWN_ERROR');
  });

  it('should default to HTTP error message if parsing fails', async () => {
    const response = new Response('Invalid JSON', {
      status: 400,
    });

    const error = await createErrorFromResponse(response);
    expect(error).toBeInstanceOf(BadRequestError);
    expect(error.message).toMatch(/HTTP error/);
  });
});

describe('409 Conflict mapping', () => {
  it('maps an enveloped 409 to ConflictError', async () => {
    const response = new Response(
      JSON.stringify({
        metadata: { message: 'x', request_id: 'req-9', timestamp: '2026-10-26T00:00:00Z' },
        error: { code: 'CONFLICT', message: 'thread is busy', details: [] },
      }),
      { status: 409, headers: { 'content-type': 'application/json' } }
    );
    const error = await createErrorFromResponse(response);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.statusCode).toBe(409);
    expect(error.name).toBe('ConflictError');
  });

  it('maps a {"detail"} 409 body to ConflictError', async () => {
    const response = new Response(JSON.stringify({ detail: 'thread is busy' }), {
      status: 409,
      headers: { 'content-type': 'application/json' },
    });
    const error = await createErrorFromResponse(response);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.message).toBe('thread is busy');
  });

  it('maps an unparseable 409 to ConflictError', async () => {
    const response = new Response('nope', { status: 409 });
    const error = await createErrorFromResponse(response, 'busy');
    expect(error).toBeInstanceOf(ConflictError);
  });
});
