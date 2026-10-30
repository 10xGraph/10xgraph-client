import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TenxGraphClient, basicAuth, headerAuth } from '../src/index';
import type { PingResponse } from '../src/index';

const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('TenxGraphClient auth configuration', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('supports basic authentication with custom headers and credentials', async () => {
    const client = new TenxGraphClient({
      baseUrl: 'http://localhost:8000',
      auth: basicAuth('service-user', 'service-pass'),
      headers: { 'X-Trace-Id': 'trace-1' },
      credentials: 'include',
      debug: false,
    });

    const mockResponse: PingResponse = {
      data: 'pong',
      metadata: {
        request_id: 'req-1',
        timestamp: '2026-04-03T00:00:00.000Z',
        message: 'OK',
      },
    };

    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockResponse),
    });

    await client.ping();

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/ping', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Trace-Id': 'trace-1',
        Authorization: 'Basic c2VydmljZS11c2VyOnNlcnZpY2UtcGFzcw==',
      },
      credentials: 'include',
      signal: expect.any(AbortSignal),
    });
  });

  it('supports non-authorization auth headers such as API keys', async () => {
    const client = new TenxGraphClient({
      baseUrl: 'http://localhost:8000',
      auth: headerAuth('X-API-Key', 'secret-key'),
      debug: false,
    });

    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: 'pong',
        metadata: {
          request_id: 'req-2',
          timestamp: '2026-04-03T00:00:00.000Z',
          message: 'OK',
        },
      }),
    });

    await client.ping();

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/ping', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'secret-key',
      },
      redirect: 'manual',
      signal: expect.any(AbortSignal),
    });
  });
});
