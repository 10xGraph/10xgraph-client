import { describe, it, expect, vi } from 'vitest';
import { wsStreamInvoke } from '../src/endpoints/wsStream';
import { WebSocketError, RequestTimeoutError } from '../src/errors';
import { Message } from '../src/message';

class FakeWs {
  static last: FakeWs;
  readyState = 1;
  sent: string[] = [];
  closedWith?: number;
  listeners: Record<string, Array<(e: any) => void>> = {};
  constructor() {
    FakeWs.last = this;
  }
  addEventListener(t: string, fn: (e: any) => void) {
    (this.listeners[t] ||= []).push(fn);
  }
  removeEventListener(t: string, fn: (e: any) => void) {
    this.listeners[t] = (this.listeners[t] || []).filter((f) => f !== fn);
  }
  send(d: string) {
    this.sent.push(d);
  }
  close(code?: number) {
    this.closedWith = code;
    this.readyState = 3;
    this.emit('close', { code });
  }
  emit(t: string, e: any) {
    (this.listeners[t] || []).forEach((f) => f(e));
  }
  msg(o: unknown) {
    this.emit('message', { data: JSON.stringify(o) });
  }
}

const base = {
  baseUrl: 'http://localhost:8000',
  timeout: 5000,
  debug: false,
  webSocketImpl: FakeWs as any,
};
const req = { messages: [] as any[] };
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('G-12: wsStream terminal handling', () => {
  it('ends after an error chunk instead of hanging', async () => {
    const gen = wsStreamInvoke(base, req);
    const first = gen.next();
    await tick();
    FakeWs.last.msg({ event: 'error', data: { message: 'busy' } });
    expect((await first).value).toMatchObject({ event: 'error' });
    const end = await Promise.race([
      gen.next(),
      new Promise((r) => setTimeout(() => r('HUNG'), 300)),
    ]);
    expect(end).toMatchObject({ done: true });
  });

  it.each([1012, 1008, 1011, 1013])('close %i before done throws WebSocketError', async (code) => {
    const gen = wsStreamInvoke(base, req);
    const first = gen.next();
    await tick();
    FakeWs.last.msg({ event: 'message', message: { role: 'assistant', content: [] } });
    await first;
    const next = gen.next();
    await tick();
    FakeWs.last.emit('close', { code });
    await expect(next).rejects.toMatchObject({ closeCode: code });
    // class check
    const gen2 = wsStreamInvoke(base, req);
    const n2 = gen2.next();
    await tick();
    FakeWs.last.emit('close', { code });
    await expect(n2).rejects.toBeInstanceOf(WebSocketError);
  });

  it('a stalled socket times out (idle timeout)', async () => {
    const gen = wsStreamInvoke({ ...base, timeout: 80 }, req);
    const first = gen.next();
    await tick();
    await expect(first).rejects.toBeInstanceOf(RequestTimeoutError);
    expect(FakeWs.last.closedWith).toBe(1000);
  });
});

describe('G-135: connect failure cleans up', () => {
  it('removes its abort listener and closes the socket when connect fails', async () => {
    const ac = new AbortController();
    const add = vi.spyOn(ac.signal, 'addEventListener');
    const remove = vi.spyOn(ac.signal, 'removeEventListener');
    class ClosedWs extends FakeWs {
      constructor() {
        super();
        this.readyState = 0;
      }
    }
    const gen = wsStreamInvoke({ ...base, webSocketImpl: ClosedWs as any, signal: ac.signal }, req);
    const p = gen.next();
    await tick();
    FakeWs.last.emit('error', {});
    await expect(p).rejects.toBeDefined();
    const added = add.mock.calls.filter((c) => c[0] === 'abort').map((c) => c[1]);
    const removed = remove.mock.calls.filter((c) => c[0] === 'abort').map((c) => c[1]);
    for (const fn of added) expect(removed).toContain(fn);
  });
});

describe('G-140: wsStream tool loop is bounded', () => {
  it('stops resuming at recursion_limit and reports it', async () => {
    const executor = {
      executeToolCalls: vi.fn().mockResolvedValue([Message.text_message('r', 'tool')]),
    } as any;
    const gen = wsStreamInvoke(
      { ...base, toolExecutor: executor },
      { messages: [], recursion_limit: 3 }
    );
    const seen: any[] = [];
    const run = (async () => {
      for await (const c of gen) seen.push(c);
    })();
    for (let i = 0; i < 10; i++) {
      await tick();
      const ws = FakeWs.last;
      if (ws.sent.length <= i) break;
      ws.msg({
        event: 'message',
        message: {
          role: 'assistant',
          content: [{ type: 'remote_tool_call', id: 'c', name: 't', args: {} }],
        },
      });
      ws.msg({ event: 'updates', data: { status: 'done' } });
    }
    await run;
    expect(executor.executeToolCalls.mock.calls.length).toBeLessThanOrEqual(3);
    expect(FakeWs.last.sent.length).toBeLessThanOrEqual(3);
    expect(seen[seen.length - 1].data.recursion_limit_reached).toBe(true);
  });
});
