import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TenxGraphClient,
  ToolExecutor,
  Message,
  RemoteToolCallBlock,
  NetworkError,
  RequestTimeoutError,
  headerAuth,
} from '../src/index.js';
import { normalizeBaseUrl } from '../src/request.js';

const okJson = (body: unknown = { data: {}, metadata: {} }) => ({
  ok: true,
  status: 200,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => body,
});

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('G-139: timeout timer is cleared when fetch rejects', () => {
  it('leaves no pending timer after a network failure', async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const client = new TenxGraphClient({ baseUrl: 'http://h', timeout: 60000 });
    await expect(client.ping()).rejects.toBeInstanceOf(NetworkError);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('maps an abort that the caller did not request to RequestTimeoutError', async () => {
    const e = new Error('aborted');
    e.name = 'AbortError';
    fetchMock.mockRejectedValue(e);
    const client = new TenxGraphClient({ baseUrl: 'http://h', timeout: 25 });
    await expect(client.ping()).rejects.toBeInstanceOf(RequestTimeoutError);
  });
});

describe('G-148: signal on every request method', () => {
  it('a caller abort rejects with AbortError, not a timeout', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_, reject) => {
          init.signal!.addEventListener('abort', () => {
            const e = new Error('aborted');
            e.name = 'AbortError';
            reject(e);
          });
        })
    );
    const client = new TenxGraphClient({ baseUrl: 'http://h' });
    const ac = new AbortController();
    const p = client.threadMessages(1, {}, { signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('works for the options-object methods and the overloads', async () => {
    fetchMock.mockResolvedValue(okJson());
    const client = new TenxGraphClient({ baseUrl: 'http://h' });
    const ac = new AbortController();
    ac.abort();
    for (const call of [
      () => client.ping({ signal: ac.signal }),
      () => client.threads({}, { signal: ac.signal }),
      () => client.listMemories({ signal: ac.signal }),
      () => client.getFile('f', { signal: ac.signal }),
    ]) {
      fetchMock.mockImplementation(
        (_u: string, init: RequestInit) =>
          new Promise((_, reject) => {
            if (init.signal!.aborted) {
              const e = new Error('aborted');
              e.name = 'AbortError';
              reject(e);
            }
          })
      );
      await expect(call()).rejects.toMatchObject({ name: 'AbortError' });
    }
  });
});

describe('G-144: path ids are percent-encoded', () => {
  it('encodes thread and message ids', async () => {
    fetchMock.mockResolvedValue(okJson());
    const client = new TenxGraphClient({ baseUrl: 'http://h' });
    await client.deleteThread('a/b?c#d');
    expect(fetchMock.mock.calls[0][0]).toBe('http://h/v1/threads/a%2Fb%3Fc%23d');
    await client.singleMessage('t', 'm/1');
    expect(fetchMock.mock.calls[1][0]).toBe('http://h/v1/threads/t/messages/m%2F1');
    await client.getMemory('x/../y');
    expect(fetchMock.mock.calls[2][0]).toBe('http://h/v1/store/memories/x%2F..%2Fy');
  });
});

describe('G-143: base URL and header-credential redirects', () => {
  it('strips trailing slashes from the base URL', async () => {
    fetchMock.mockResolvedValue(okJson());
    await new TenxGraphClient({ baseUrl: 'http://h///' }).ping();
    expect(fetchMock.mock.calls[0][0]).toBe('http://h/ping');
  });

  it('strips trailing slashes in linear time', () => {
    expect(normalizeBaseUrl('http://h')).toBe('http://h');
    expect(normalizeBaseUrl('///')).toBe('');
    // Many slashes before a non-slash: the old /\/+$/ was quadratic on this.
    const slashes = '/'.repeat(200_000);
    const started = performance.now();
    expect(normalizeBaseUrl(`${slashes}x`)).toBe(`${slashes}x`);
    expect(normalizeBaseUrl(`x${slashes}`)).toBe('x');
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('refuses a cross-origin redirect when header credentials are used', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 302,
      headers: new Headers({ location: 'http://evil.example/steal' }),
    });
    const client = new TenxGraphClient({ baseUrl: 'http://h', auth: headerAuth('X-API-Key', 'k') });
    await expect(client.ping()).rejects.toBeInstanceOf(NetworkError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not use manual redirects for Authorization-named header auth or bearer auth', async () => {
    fetchMock.mockResolvedValue(okJson());
    await new TenxGraphClient({
      baseUrl: 'http://h',
      auth: headerAuth('Authorization', 'x'),
    }).ping();
    await new TenxGraphClient({ baseUrl: 'http://h', authToken: 't' }).ping();
    expect(fetchMock.mock.calls[0][1].redirect).toBeUndefined();
    expect(fetchMock.mock.calls[1][1].redirect).toBeUndefined();
  });

  it('throws a clear NetworkError on an opaqueredirect response (browsers)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 0,
      type: 'opaqueredirect',
      headers: new Headers(),
    });
    const client = new TenxGraphClient({ baseUrl: 'http://h', auth: headerAuth('X-API-Key', 'k') });
    await expect(client.ping()).rejects.toThrow(/Point baseUrl at the final URL/);
    await expect(client.ping()).rejects.toBeInstanceOf(NetworkError);
  });

  it('follows a same-origin redirect', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 301,
        headers: new Headers({ location: '/ping2' }),
      })
      .mockResolvedValueOnce(okJson({ data: 'pong', metadata: {} }));
    const client = new TenxGraphClient({ baseUrl: 'http://h', auth: headerAuth('X-API-Key', 'k') });
    await client.ping();
    expect(fetchMock.mock.calls[1][0]).toBe('http://h/ping2');
  });
});

describe('G-146: token per request, setter and clear', () => {
  const authHeader = (i: number) => fetchMock.mock.calls[i][1].headers.Authorization;

  it('calls an authToken function before every request', async () => {
    fetchMock.mockResolvedValue(okJson());
    let n = 0;
    const client = new TenxGraphClient({ baseUrl: 'http://h', authToken: () => `tok-${++n}` });
    await client.ping();
    await client.ping();
    expect(authHeader(0)).toBe('Bearer tok-1');
    expect(authHeader(1)).toBe('Bearer tok-2');
  });

  it('setAuthToken replaces and clearAuth removes the credentials', async () => {
    fetchMock.mockResolvedValue(okJson());
    const client = new TenxGraphClient({ baseUrl: 'http://h', authToken: 'old' });
    client.setAuthToken('new');
    await client.ping();
    client.clearAuth();
    await client.ping();
    expect(authHeader(0)).toBe('Bearer new');
    expect(authHeader(1)).toBeUndefined();
  });
});

describe('G-149: remote tool argument checks', () => {
  function call(name: string, args: any, id = 'c1'): Message {
    return new Message('assistant', [
      { type: 'remote_tool_call', id, name, args } as unknown as RemoteToolCallBlock,
    ]);
  }
  const output = (m: Message) => (m.content[0] as any).output;

  it('runs the validate hook and rejects when it returns false', async () => {
    const handler = vi.fn(async () => 'ok');
    const ex = new ToolExecutor([]);
    ex.registerTool({ name: 't', handler, validate: (a) => a.n > 0 });
    const [bad] = await ex.executeToolCalls([call('t', { n: -1 })]);
    expect((bad.content[0] as any).is_error).toBe(true);
    expect(handler).not.toHaveBeenCalled();
    const [good] = await ex.executeToolCalls([call('t', { n: 1 })]);
    expect(output(good)).toBe('ok');
  });

  it('enforces declared required and typed parameters', async () => {
    const handler = vi.fn(async () => 'ok');
    const ex = new ToolExecutor([]);
    ex.registerTool({
      name: 't',
      handler,
      parameters: {
        type: 'object',
        properties: { city: { type: 'string' } },
        required: ['city'],
        additionalProperties: false,
      },
    });
    for (const args of [{}, { city: 5 }, { city: 'x', extra: 1 }]) {
      const [r] = await ex.executeToolCalls([call('t', args)]);
      expect((r.content[0] as any).is_error).toBe(true);
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it('caps argument size', async () => {
    const handler = vi.fn(async () => 'ok');
    const ex = new ToolExecutor([]);
    ex.registerTool({ name: 't', handler, maxArgsBytes: 10 });
    const [r] = await ex.executeToolCalls([call('t', { text: 'x'.repeat(50) })]);
    expect((r.content[0] as any).is_error).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects a repeated call id within one batch', async () => {
    const handler = vi.fn(async () => 'ok');
    const ex = new ToolExecutor([]);
    ex.registerTool({ name: 't', handler });
    const results = await ex.executeToolCalls([call('t', {}, 'dup'), call('t', {}, 'dup')]);
    expect(handler).toHaveBeenCalledTimes(1);
    expect((results[1].content[0] as any).is_error).toBe(true);
  });
});

describe('G-140/G-152 (client.ts): shared serializer and recursion_limit 0', () => {
  it('invoke sends recursion_limit 0 and keeps empty arrays', async () => {
    fetchMock.mockResolvedValue(okJson({ data: { messages: [], state: null }, metadata: {} }));
    const client = new TenxGraphClient({ baseUrl: 'http://h' });
    const m = new Message('tool', [
      { type: 'tool_result', call_id: 'c', output: [], is_error: false } as any,
    ]);
    await client.invoke([m], { recursion_limit: 0 });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.recursion_limit).toBe(0);
    expect(body.messages[0].content[0].output).toEqual([]);
  });
});

describe('G-152: addThreadMessages serializes messages', () => {
  it('sends message_id "0" instead of null', async () => {
    fetchMock.mockResolvedValue(okJson());
    const client = new TenxGraphClient({ baseUrl: 'http://h' });
    await client.addThreadMessages('t', [Message.text_message('hi', 'user')]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0].message_id).toBe('0');
  });
});
