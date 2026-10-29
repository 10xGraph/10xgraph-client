import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TenxGraphClient } from '../src/client';

const fetchMock = vi.fn();
global.fetch = fetchMock;

const client = new TenxGraphClient({ baseUrl: 'http://localhost:8000', authToken: 't' });

beforeEach(() => fetchMock.mockReset());

describe('listFiles', () => {
  it('GETs /v1/files with limit and offset', async () => {
    const payload = {
      data: {
        files: [
          {
            file_id: 'ab12',
            filename: 'cv.pdf',
            mime_type: 'application/pdf',
            size_bytes: 10,
            url: '/v1/files/ab12',
            created_at: 1761600000,
          },
        ],
        has_more: true,
        offset: 50,
        limit: 25,
      },
    };
    fetchMock.mockResolvedValue({ ok: true, json: async () => payload });

    const res = await client.listFiles({ limit: 25, offset: 50 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8000/v1/files?limit=25&offset=50');
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization ?? init.headers.authorization).toBe('Bearer t');
    expect(res.data.files[0].file_id).toBe('ab12');
    expect(res.data.has_more).toBe(true);
  });

  it('sends no query string without params', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { files: [], has_more: false, offset: 0, limit: 50 } }),
    });
    await client.listFiles();
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8000/v1/files');
  });

  it('throws on 501 (store cannot enumerate)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 501,
      statusText: 'Not Implemented',
      headers: new Headers(),
      json: async () => ({ detail: 'cannot list' }),
      text: async () => '{"detail":"cannot list"}',
    });
    await expect(client.listFiles()).rejects.toMatchObject({
      name: expect.stringMatching(/Error/),
    });
  });
});

describe('thread list paging fields', () => {
  it('passes has_more, offset and limit through threads()', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { threads: [], has_more: true, offset: 0, limit: 100 },
        metadata: {},
      }),
    });
    const res = await client.threads({ limit: 100 });
    expect(res.data.has_more).toBe(true);
    expect(res.data.limit).toBe(100);
  });

  it('passes has_more through threadMessages()', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { messages: [], has_more: false, offset: 0, limit: 100 },
        metadata: {},
      }),
    });
    const res = await client.threadMessages('t1', {});
    expect(res.data.has_more).toBe(false);
    expect(res.data.offset).toBe(0);
  });
});
