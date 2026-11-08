import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TenxGraphClient, PermissionError, AuthenticationError, isAuthOff } from '../src/index';
import type { MeIdentity } from '../src/index';

const fetchMock = vi.fn();
global.fetch = fetchMock;

const metadata = { request_id: 'r1', timestamp: '2026-11-08T00:00:00', message: 'OK' };

function ok(data: unknown) {
  return new Response(JSON.stringify({ data, metadata }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function fail(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ metadata, error: { code, message, details: [] } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('me', () => {
  let client: TenxGraphClient;

  beforeEach(() => {
    fetchMock.mockReset();
    client = new TenxGraphClient({ baseUrl: 'http://localhost:8000', authToken: 'tok' });
  });

  it('GETs /v1/me with the bearer token and returns the identity', async () => {
    const identity: MeIdentity = {
      user_id: 'u1',
      tenant: { org_id: 'acme' },
      roles: ['member'],
      permissions: ['graph:invoke', 'threads:read'],
      reach: 'tenant',
    };
    fetchMock.mockResolvedValue(ok(identity));

    const res = await client.me();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8000/v1/me');
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(res.data).toEqual(identity);
    expect(res.metadata.request_id).toBe('r1');
    expect(isAuthOff(res.data)).toBe(false);
    if (!isAuthOff(res.data)) {
      expect(res.data.reach).toBe('tenant');
    }
  });

  it('reports an unrestricted identity with the wildcard permission', async () => {
    fetchMock.mockResolvedValue(
      ok({ user_id: 'root', tenant: {}, roles: [], permissions: ['*'], reach: 'all' })
    );
    const res = await client.me();
    expect(isAuthOff(res.data)).toBe(false);
    expect((res.data as MeIdentity).permissions).toEqual(['*']);
  });

  it('returns { auth: "off" } when the server has auth off', async () => {
    fetchMock.mockResolvedValue(ok({ auth: 'off' }));
    const res = await client.me();
    expect(res.data).toEqual({ auth: 'off' });
    expect(isAuthOff(res.data)).toBe(true);
  });

  it('works without a token', async () => {
    const anon = new TenxGraphClient({ baseUrl: 'http://localhost:8000' });
    fetchMock.mockResolvedValue(ok({ auth: 'off' }));
    await anon.me();
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('maps 403 to PermissionError', async () => {
    fetchMock.mockResolvedValue(fail(403, 'PERMISSION_ERROR', 'forbidden'));
    await expect(client.me()).rejects.toBeInstanceOf(PermissionError);
  });

  it('rejects on 401', async () => {
    fetchMock.mockResolvedValue(fail(401, 'AUTHENTICATION_ERROR', 'bad token'));
    await expect(client.me()).rejects.toBeInstanceOf(AuthenticationError);
  });
});
