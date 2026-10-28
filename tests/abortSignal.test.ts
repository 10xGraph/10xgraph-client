import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '../src/endpoints/invoke';
import { streamInvoke } from '../src/endpoints/stream';
import { wsStreamInvoke } from '../src/endpoints/wsStream';
import { linkAbortSignal } from '../src/request';

const fetchMock = vi.fn();
global.fetch = fetchMock;

const ctx = { baseUrl: 'http://localhost:8000', timeout: 5000, debug: false };
const req = { messages: [] as any[] };

/** fetch mock that rejects with AbortError when the passed signal aborts. */
function hangingFetch() {
  fetchMock.mockImplementation(
    (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => {
          const e = new Error('aborted');
          e.name = 'AbortError';
          reject(e);
        });
      })
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('linkAbortSignal', () => {
  it('aborts the controller when the signal aborts, and cleanup unlinks', () => {
    const c = new AbortController();
    const s = new AbortController();
    const unlink = linkAbortSignal(c, s.signal);
    s.abort();
    expect(c.signal.aborted).toBe(true);

    const c2 = new AbortController();
    const s2 = new AbortController();
    linkAbortSignal(c2, s2.signal)();
    s2.abort();
    expect(c2.signal.aborted).toBe(false);
    unlink();
  });

  it('aborts immediately for an already aborted signal', () => {
    const c = new AbortController();
    linkAbortSignal(c, AbortSignal.abort());
    expect(c.signal.aborted).toBe(true);
  });
});

describe('invoke signal', () => {
  it('cancels the request and surfaces AbortError, not a timeout', async () => {
    hangingFetch();
    const ac = new AbortController();
    const p = invoke({ ...ctx, signal: ac.signal }, req);
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('does not call fetch when already aborted', async () => {
    await expect(invoke({ ...ctx, signal: AbortSignal.abort() }, req)).rejects.toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('stream signal', () => {
  it('cancels the request on abort', async () => {
    hangingFetch();
    const ac = new AbortController();
    const gen = streamInvoke({ ...ctx, signal: ac.signal }, req);
    const next = gen.next();
    ac.abort();
    await expect(next).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('cancels while the body is being read', async () => {
    const encoder = new TextEncoder();
    let init!: RequestInit;
    fetchMock.mockImplementation(async (_u: string, i: RequestInit) => {
      init = i;
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('{"event":"message"}\n'));
          i.signal!.addEventListener('abort', () => {
            const e = new Error('aborted');
            e.name = 'AbortError';
            controller.error(e);
          });
        },
      });
      return { ok: true, body };
    });
    const ac = new AbortController();
    const gen = streamInvoke({ ...ctx, signal: ac.signal }, req);
    const first = await gen.next();
    expect(first.done).toBe(false);
    ac.abort();
    await expect(gen.next()).rejects.toMatchObject({ name: 'AbortError' });
    expect(init.signal!.aborted).toBe(true);
  });
});

describe('wsStream signal', () => {
  class FakeWs {
    readyState = 1;
    sent: string[] = [];
    closed = false;
    listeners: Record<string, Array<(e: any) => void>> = {};
    addEventListener(t: string, fn: (e: any) => void) {
      (this.listeners[t] ||= []).push(fn);
    }
    removeEventListener() {}
    send(d: string) {
      this.sent.push(d);
    }
    close(code?: number) {
      this.closed = true;
      this.readyState = 3;
      (this.listeners['close'] || []).forEach((f) => f({ code }));
    }
  }

  it('closes the socket and throws AbortError on abort', async () => {
    const ws = new FakeWs();
    const ac = new AbortController();
    const gen = wsStreamInvoke(
      {
        ...ctx,
        signal: ac.signal,
        webSocketImpl: function () {
          return ws;
        } as any,
      },
      req
    );
    const next = gen.next();
    await new Promise((r) => setTimeout(r, 0));
    ac.abort();
    await expect(next).rejects.toMatchObject({ name: 'AbortError' });
    expect(ws.closed).toBe(true);
  });

  it('rejects without connecting when already aborted', async () => {
    const gen = wsStreamInvoke({ ...ctx, signal: AbortSignal.abort() }, req);
    await expect(gen.next()).rejects.toBeDefined();
  });
});
