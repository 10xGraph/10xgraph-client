import { describe, it, expect } from 'vitest';
import {
  ConflictError,
  GraphRecursionError,
  RateLimitError,
  RequestTimeoutError,
  NetworkError,
  WebSocketError,
  StreamError,
  SchemaVersionError,
  SerializationError,
  ServerError,
  StorageError,
  TenxGraphError,
  TransientStorageError,
  ValidationError,
  createErrorFromResponse,
} from '../src/index.js';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function envelope(code: string, message = 'boom') {
  return {
    metadata: { message: 'x', request_id: 'req-1', timestamp: '2026-01-01T00:00:00Z' },
    error: { code, message, details: [] },
  };
}

describe('createErrorFromResponse: bodies outside the envelope (G-14)', () => {
  it('maps the real 409 state_conflict body to ConflictError', async () => {
    const res = jsonResponse(409, {
      error: 'state_conflict',
      detail: 'This thread was updated by another run.',
      thread_id: 't1',
    });
    const err = await createErrorFromResponse(res, undefined, '/v1/graph/invoke', 'POST');
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.message).toBe('This thread was updated by another run.');
    expect(err.statusCode).toBe(409);
  });

  it('does not throw on a JSON body with no known shape', async () => {
    const err = await createErrorFromResponse(jsonResponse(500, { foo: 1 }), 'fallback');
    expect(err).toBeInstanceOf(ServerError);
    expect(err.message).toBe('fallback');
  });

  it('does not throw on a JSON array or null body', async () => {
    expect(await createErrorFromResponse(jsonResponse(400, [1, 2]))).toBeInstanceOf(TenxGraphError);
    expect(await createErrorFromResponse(jsonResponse(400, null))).toBeInstanceOf(TenxGraphError);
  });

  it('handles an envelope that has no metadata', async () => {
    const err = await createErrorFromResponse(
      jsonResponse(404, { error: { code: 'X', message: 'gone' } })
    );
    expect(err.message).toBe('gone');
    expect(err.requestId).toBe('unknown');
  });

  it('maps a FastAPI detail list to ValidationError details', async () => {
    const res = jsonResponse(422, { detail: [{ loc: ['body', 'x'], msg: 'bad', type: 'v' }] });
    const err = await createErrorFromResponse(res);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.details[0].msg).toBe('bad');
  });

  it('uses x-request-id when the body carries none', async () => {
    const res = jsonResponse(409, { error: 'state_conflict', detail: 'd' }, { 'x-request-id': 'hdr-9' });
    expect((await createErrorFromResponse(res)).requestId).toBe('hdr-9');
  });

  it('keeps headers and raw body on the error and sets endpoint and method', async () => {
    const body = envelope('X');
    const err = await createErrorFromResponse(
      jsonResponse(404, body, { 'x-foo': 'bar' }),
      undefined,
      '/v1/x',
      'GET'
    );
    expect(err.endpoint).toBe('/v1/x');
    expect(err.method).toBe('GET');
    expect(err.responseHeaders?.['x-foo']).toBe('bar');
    expect(err.responseBody).toEqual(body);
  });
});

describe('createErrorFromResponse: real server error codes (G-159)', () => {
  it('RECURSION_001 -> GraphRecursionError', async () => {
    expect(await createErrorFromResponse(jsonResponse(500, envelope('RECURSION_001')))).toBeInstanceOf(
      GraphRecursionError
    );
  });
  it('STORAGE_TRANSIENT_000 -> TransientStorageError', async () => {
    const err = await createErrorFromResponse(jsonResponse(503, envelope('STORAGE_TRANSIENT_000')));
    expect(err).toBeInstanceOf(TransientStorageError);
  });
  it('STORAGE_SCHEMA_000 -> SchemaVersionError', async () => {
    expect(await createErrorFromResponse(jsonResponse(500, envelope('STORAGE_SCHEMA_000')))).toBeInstanceOf(
      SchemaVersionError
    );
  });
  it('STORAGE_SERIALIZATION_000 -> SerializationError', async () => {
    expect(
      await createErrorFromResponse(jsonResponse(500, envelope('STORAGE_SERIALIZATION_000')))
    ).toBeInstanceOf(SerializationError);
  });
  it('STORAGE_000 -> StorageError', async () => {
    expect(await createErrorFromResponse(jsonResponse(500, envelope('STORAGE_000')))).toBeInstanceOf(
      StorageError
    );
  });
  it('both validation codes map to ValidationError', async () => {
    for (const code of ['VALIDATION_ERROR', 'AGENTFLOW_VALIDATION_ERROR']) {
      expect(await createErrorFromResponse(jsonResponse(422, envelope(code)))).toBeInstanceOf(
        ValidationError
      );
    }
  });
});

describe('RateLimitError (G-147)', () => {
  it('429 carries retry-after from the header', async () => {
    const res = jsonResponse(429, envelope('RATE_LIMIT_EXCEEDED'), { 'retry-after': '7' });
    const err = await createErrorFromResponse(res);
    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as RateLimitError).retryAfterSeconds).toBe(7);
  });
  it('falls back to retry_after_seconds in the body', async () => {
    const body = envelope('RATE_LIMIT_EXCEEDED');
    (body.error as Record<string, unknown>).retry_after_seconds = 3;
    const err = await createErrorFromResponse(jsonResponse(429, body));
    expect((err as RateLimitError).retryAfterSeconds).toBe(3);
  });
});

describe('transport error classes (G-150)', () => {
  it('are TenxGraphError subclasses with cause', () => {
    const cause = new TypeError('fetch failed');
    const net = new NetworkError('x', '/ping', 'GET', cause);
    expect(net).toBeInstanceOf(TenxGraphError);
    expect(net.cause).toBe(cause);
    expect(new RequestTimeoutError(50).message).toBe('Request timeout after 50ms');
    expect(new WebSocketError('closed', 1012).closeCode).toBe(1012);
    expect(new StreamError('bad chunk').errorCode).toBe('STREAM_ERROR');
  });
});
