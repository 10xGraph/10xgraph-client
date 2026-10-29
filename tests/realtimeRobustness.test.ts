import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RealtimeSession } from '../src/endpoints/realtime';

class MockWS {
  static instances: MockWS[] = [];
  static throwOnNew = false;
  readyState = 0;
  sent: any[] = [];
  closedWith?: number;
  private listeners: Record<string, ((e: any) => void)[]> = {};
  constructor() {
    if (MockWS.throwOnNew) throw new Error('ctor boom');
    MockWS.instances.push(this);
  }
  addEventListener(t: string, cb: (e: any) => void) {
    (this.listeners[t] ??= []).push(cb);
  }
  removeEventListener() {}
  send(d: any) {
    if (this.readyState !== 1) throw new Error('InvalidStateError');
    this.sent.push(d);
  }
  close(code?: number) {
    this.closedWith = code;
    this.readyState = 3;
    this.emit('close', { code: code ?? 1000 });
  }
  emit(t: string, e: any) {
    (this.listeners[t] ?? []).forEach((f) => f(e));
  }
  open() {
    this.readyState = 1;
    this.emit('open', {});
  }
}

const ctx = { baseUrl: 'http://x', authToken: 't', timeout: 5000, debug: false };
const mk = (options?: any) =>
  new RealtimeSession({ ...ctx, webSocketImpl: MockWS as any }, { thread_id: 't1' }, options);

beforeEach(() => {
  MockWS.instances = [];
  MockWS.throwOnNew = false;
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('G-15: unawaited ready does not crash the process', () => {
  it('no unhandled rejection when the connection fails', async () => {
    const seen: unknown[] = [];
    const h = (e: unknown) => seen.push(e);
    process.on('unhandledRejection', h);
    mk({ reconnect: { enabled: false } });
    MockWS.instances[0].emit('error', {});
    await vi.advanceTimersByTimeAsync(10);
    vi.useRealTimers();
    await new Promise((r) => setTimeout(r, 20));
    process.off('unhandledRejection', h);
    expect(seen).toEqual([]);
  });
});

describe('G-135: close() cancels a pending reconnect', () => {
  it('does not open a new socket after close() inside the backoff window', async () => {
    const s = mk();
    MockWS.instances[0].open();
    MockWS.instances[0].close(1006);
    s.close();
    await vi.advanceTimersByTimeAsync(20000);
    expect(MockWS.instances).toHaveLength(1);
  });
});

describe('G-136: sends are safe before the socket is open', () => {
  it('sendAudio / sendText before open do not throw', () => {
    const s = mk();
    expect(() => s.sendAudio(new Uint8Array(4))).not.toThrow();
    expect(() => s.sendText('hi')).not.toThrow();
  });
  it('close() while CONNECTING still closes the socket', () => {
    const s = mk({ reconnect: { enabled: false } });
    expect(() => s.close()).not.toThrow();
    expect(MockWS.instances[0].closedWith).toBe(1000);
  });
  it('a constructor throw inside the reconnect timer is not uncaught', async () => {
    const s = mk({ reconnect: { baseDelay: 0.1, maxAttempts: 2 } });
    const errors: any[] = [];
    s.on('error', (e) => errors.push(e));
    MockWS.instances[0].open();
    MockWS.throwOnNew = true;
    MockWS.instances[0].close(1006);
    await expect(vi.advanceTimersByTimeAsync(60000)).resolves.not.toThrow();
    expect(errors.some((e) => e.code === 'reconnect_failed')).toBe(true);
  });
});

describe('G-137: reconnect policy', () => {
  it('open-then-immediate-close does not reset the attempt budget', async () => {
    const s = mk({ reconnect: { baseDelay: 0.1, maxDelay: 0.2, maxAttempts: 3 } });
    const errors: any[] = [];
    s.on('error', (e) => errors.push(e));
    for (let i = 0; i < 10 && !errors.length; i++) {
      const ws = MockWS.instances[MockWS.instances.length - 1];
      ws.open();
      ws.close(1006);
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(errors.some((e) => e.code === 'reconnect_failed')).toBe(true);
    expect(MockWS.instances.length).toBeLessThanOrEqual(5);
  });
  it('does not retry close 1008 (policy / expired token)', async () => {
    const s = mk();
    const errors: any[] = [];
    s.on('error', (e) => errors.push(e));
    MockWS.instances[0].open();
    MockWS.instances[0].close(1008);
    await vi.advanceTimersByTimeAsync(20000);
    expect(MockWS.instances).toHaveLength(1);
    expect(errors[0]?.fatal).toBe(true);
  });
  it('a stable connection resets the budget', async () => {
    const s = mk({ reconnect: { baseDelay: 0.1, maxDelay: 0.2, maxAttempts: 1 } });
    const errors: any[] = [];
    s.on('error', (e) => errors.push(e));
    MockWS.instances[0].open();
    MockWS.instances[0].close(1006);
    await vi.advanceTimersByTimeAsync(300);
    MockWS.instances[1].open();
    await vi.advanceTimersByTimeAsync(60000); // stays up
    MockWS.instances[1].close(1006);
    await vi.advanceTimersByTimeAsync(300);
    expect(MockWS.instances).toHaveLength(3);
    expect(errors).toEqual([]);
  });
});

describe('G-146: token is resolved on every connect', () => {
  it('reconnect uses the current token', async () => {
    let tok = 'old';
    const protos: any[] = [];
    class W extends MockWS {
      constructor(_u: string, p?: any) {
        super();
        protos.push(p);
      }
    }
    new RealtimeSession(
      { ...ctx, webSocketImpl: W as any, getAuthToken: () => tok },
      { thread_id: 't' }
    );
    MockWS.instances[0].open();
    tok = 'new';
    MockWS.instances[0].close(1006);
    await vi.advanceTimersByTimeAsync(1000);
    expect(protos.map((p) => p?.[1])).toEqual(['old', 'new']);
  });
});
