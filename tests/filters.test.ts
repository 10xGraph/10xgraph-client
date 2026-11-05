import { describe, it, expect, vi, beforeEach } from 'vitest';
import { threads } from '../src/endpoints/threads';
import { listMemories } from '../src/endpoints/listMemories';
import { searchMemory } from '../src/endpoints/searchMemory';
import { forgetMemories } from '../src/endpoints/forgetMemories';
import { ValidationError, TenxGraphError } from '../src/errors';
import type { Filters } from '../src/index';

const fetchMock = vi.fn();
global.fetch = fetchMock;

const ctx = { baseUrl: 'http://localhost:8000', authToken: 't', timeout: 5000, debug: false };
const filters: Filters = {
  plan: { in: ['pro'] },
  created_at: { gte: '2026-11-01T00:00:00Z' },
  active: true,
};

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function bodyOf(call = 0) {
  return JSON.parse(fetchMock.mock.calls[call][1].body);
}

describe('filters', () => {
  beforeEach(() => fetchMock.mockReset());

  it('threads sends encoded filters in the query string', async () => {
    fetchMock.mockResolvedValue(ok({ data: { threads: [] }, metadata: {} }));
    await threads(ctx, { filters });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get('filters')).toBe(JSON.stringify(filters));
    expect(fetchMock.mock.calls[0][0]).toContain('filters=%7B');
  });

  it.each([[undefined], [{}]])('threads omits filters when %j', async (f) => {
    fetchMock.mockResolvedValue(ok({ data: { threads: [] }, metadata: {} }));
    await threads(ctx, { limit: 5, filters: f as Filters | undefined });
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.has('filters')).toBe(false);
  });

  it('listMemories sends filters in the body', async () => {
    fetchMock.mockResolvedValue(ok({ data: { memories: [] }, metadata: {} }));
    await listMemories(ctx, { filters });
    expect(bodyOf().filters).toEqual(filters);
  });

  it('listMemories omits filters when empty', async () => {
    fetchMock.mockResolvedValue(ok({ data: { memories: [] }, metadata: {} }));
    await listMemories(ctx, { filters: {} });
    expect('filters' in bodyOf()).toBe(false);
  });

  it('searchMemory sends filters in the body', async () => {
    fetchMock.mockResolvedValue(ok({ data: { results: [] }, metadata: {} }));
    await searchMemory(ctx, { query: 'q', filters });
    expect(bodyOf().filters).toEqual(filters);
  });

  it('forgetMemories sends filters in the body', async () => {
    fetchMock.mockResolvedValue(ok({ data: { success: true, data: {} }, metadata: {} }));
    await forgetMemories(ctx, { filters });
    expect(bodyOf().filters).toEqual(filters);
  });

  it('still accepts Record<string, any> filters', async () => {
    const legacy: Record<string, any> = { tag: 'x' };
    fetchMock.mockResolvedValue(ok({ data: { results: [] }, metadata: {} }));
    await searchMemory(ctx, { query: 'q', filters: legacy });
    expect(bodyOf().filters).toEqual(legacy);
  });

  describe('422 responses', () => {
    const message = 'Unknown filter column: nope';
    const res = () =>
      new Response(
        JSON.stringify({
          error: { code: 'VALIDATION_ERROR', message, details: [] },
          metadata: { request_id: 'r1', timestamp: '2026-11-05T00:00:00Z' },
        }),
        {
          status: 422,
          statusText: 'Unprocessable Entity',
          headers: { 'content-type': 'application/json' },
        }
      );

    const calls: Array<[string, () => Promise<unknown>]> = [
      ['threads', () => threads(ctx, { filters: { nope: 1 } })],
      ['listMemories', () => listMemories(ctx, { filters: { nope: 1 } })],
      ['searchMemory', () => searchMemory(ctx, { query: 'q', filters: { nope: 1 } })],
      ['forgetMemories', () => forgetMemories(ctx, { filters: { nope: 1 } })],
    ];

    it.each(calls)('%s throws ValidationError with the server message', async (_n, fn) => {
      fetchMock.mockResolvedValue(res());
      const err = (await fn().catch((e) => e)) as TenxGraphError;
      expect(err).toBeInstanceOf(ValidationError);
      expect(err).toBeInstanceOf(TenxGraphError);
      expect(err.message).toBe(message);
      expect(err.statusCode).toBe(422);
    });
  });
});
