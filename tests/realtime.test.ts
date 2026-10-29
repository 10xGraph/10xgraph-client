import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RealtimeSession } from '../src/endpoints/realtime.js';
import { TenxGraphClient } from '../src/client.js';

// ── Minimal controllable WebSocket mock ──────────────────────────────────────
class MockWS {
  static OPEN = 1;
  static CLOSED = 3;
  static instances: MockWS[] = [];

  url: string;
  protocols?: any;
  readyState = 0;
  binaryType = 'blob';
  sent: any[] = [];
  closedWith?: number;
  private listeners: Record<string, ((...a: any[]) => any)[]> = {};

  constructor(url: string, protocols?: any) {
    this.url = url;
    this.protocols = protocols;
    MockWS.instances.push(this);
  }
  addEventListener(type: string, cb: (...a: any[]) => any) {
    (this.listeners[type] ??= []).push(cb);
  }
  removeEventListener(type: string, cb: (...a: any[]) => any) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== cb);
  }
  send(data: any) {
    this.sent.push(data);
  }
  close(code?: number) {
    this.closedWith = code;
    this.readyState = MockWS.CLOSED;
    this.emit('close', { code: code ?? 1000 });
  }
  // ── test helpers ──
  emit(type: string, ev: any) {
    (this.listeners[type] ?? []).forEach((f) => f(ev));
  }
  open() {
    this.readyState = MockWS.OPEN;
    this.emit('open', {});
  }
  message(data: any) {
    this.emit('message', { data });
  }
}

const baseCtx = {
  baseUrl: 'http://localhost:8000',
  authToken: 'tok',
  timeout: 5000,
  debug: false,
};

function newSession(
  init: any = { model: 'gemini-2.5-flash-live', thread_id: 't1' },
  options?: any
) {
  return new RealtimeSession({ ...baseCtx, webSocketImpl: MockWS as any }, init, options);
}

describe('RealtimeSession transport', () => {
  beforeEach(() => {
    MockWS.instances = [];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('connects to /v1/graph/live with the bearer subprotocol', () => {
    newSession();
    const ws = MockWS.instances[0];
    expect(ws.url).toBe('ws://localhost:8000/v1/graph/live');
    expect(ws.protocols).toEqual(['10xgraph-bearer', 'tok']);
  });

  it('sends the init frame as JSON once open, and resolves ready', async () => {
    const s = newSession({ model: 'm', thread_id: 't1', modalities: 'AUDIO' });
    const ws = MockWS.instances[0];
    ws.open();
    await s.ready;
    expect(JSON.parse(ws.sent[0])).toEqual({ model: 'm', thread_id: 't1', modalities: 'AUDIO' });
  });

  it('sends no thread_id when the caller omits one, and takes the server id', async () => {
    const s = newSession({ model: 'm' });
    const ws = MockWS.instances[0];
    ws.open();
    await s.ready;
    expect(JSON.parse(ws.sent[0])).toEqual({ model: 'm' });
    expect(s.threadId).toBeNull();
    const seen: any[] = [];
    s.on('session_started', (e) => seen.push(e));
    ws.message(JSON.stringify({ type: 'session_started', thread_id: 'srv-7' }));
    expect(s.threadId).toBe('srv-7');
    expect(seen).toEqual([{ type: 'session_started', thread_id: 'srv-7' }]);
  });

  it('reuses the server-given thread_id on reconnect', async () => {
    vi.useFakeTimers();
    try {
      const s = newSession({ model: 'm' });
      const first = MockWS.instances[0];
      first.open();
      first.message(JSON.stringify({ type: 'session_started', thread_id: 'srv-7' }));
      first.close(1006);
      await vi.advanceTimersByTimeAsync(1000);
      const second = MockWS.instances[1];
      second.open();
      expect(JSON.parse(second.sent[0])).toEqual({ model: 'm', thread_id: 'srv-7' });
      expect(s.threadId).toBe('srv-7');
    } finally {
      vi.useRealTimers();
    }
  });

  it('emits audio (as Uint8Array) for binary frames', () => {
    const s = newSession();
    const ws = MockWS.instances[0];
    ws.open();
    const chunks: Uint8Array[] = [];
    s.on('audio', (pcm) => chunks.push(pcm));
    const buf = new Uint8Array([1, 2, 3]).buffer;
    ws.message(buf);
    expect(chunks).toHaveLength(1);
    expect(Array.from(chunks[0])).toEqual([1, 2, 3]);
  });

  it('parses JSON frames into typed events and dispatches per-type', () => {
    const s = newSession();
    const ws = MockWS.instances[0];
    ws.open();
    const got: any[] = [];
    s.on('output_transcript', (e) => got.push(e));
    ws.message(JSON.stringify({ type: 'output_transcript', text: 'hi', finished: false }));
    expect(got).toEqual([{ type: 'output_transcript', text: 'hi', finished: false }]);
  });

  it('sends control frames: text, activity_start/end, close', () => {
    const s = newSession();
    const ws = MockWS.instances[0];
    ws.open();
    s.sendText('hello');
    s.activityStart();
    s.activityEnd();
    s.close();
    expect(JSON.parse(ws.sent[1])).toEqual({ type: 'text', text: 'hello' });
    expect(JSON.parse(ws.sent[2])).toEqual({ type: 'activity_start' });
    expect(JSON.parse(ws.sent[3])).toEqual({ type: 'activity_end' });
    expect(JSON.parse(ws.sent[4])).toEqual({ type: 'close' });
  });

  it('sends audio as raw binary', () => {
    const s = newSession();
    const ws = MockWS.instances[0];
    ws.open();
    const pcm = new Uint8Array([9, 8, 7]);
    s.sendAudio(pcm);
    expect(ws.sent[1]).toBe(pcm);
  });

  it('tracks the latest resumption_handle from session_update', () => {
    const s = newSession();
    const ws = MockWS.instances[0];
    ws.open();
    ws.message(JSON.stringify({ type: 'session_update', resumption_handle: 'h1' }));
    expect(s.resumptionHandle).toBe('h1');
  });
});

describe('RealtimeSession reconnect', () => {
  beforeEach(() => {
    MockWS.instances = [];
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reconnects with backoff after an unexpected close and re-sends init', async () => {
    const s = newSession(
      { model: 'm', thread_id: 't1' },
      { reconnect: { baseDelay: 0.5, maxDelay: 10, maxAttempts: 5 } }
    );
    const first = MockWS.instances[0];
    first.open();
    await s.ready;

    const attempts: number[] = [];
    s.on('reconnecting', (n) => attempts.push(n));

    // Simulate server-side drop (not a clean close()).
    first.readyState = MockWS.CLOSED;
    first.emit('close', { code: 1006 });

    // First backoff = 0.5s.
    await vi.advanceTimersByTimeAsync(500);
    expect(MockWS.instances).toHaveLength(2);
    expect(attempts).toEqual([1]);

    const second = MockWS.instances[1];
    second.open();
    expect(JSON.parse(second.sent[0])).toEqual({ model: 'm', thread_id: 't1' });
  });

  it('includes the latest resumption_handle in the reconnect init frame', async () => {
    const s = newSession({ model: 'm', thread_id: 't1' });
    const first = MockWS.instances[0];
    first.open();
    await s.ready;
    first.message(JSON.stringify({ type: 'session_update', resumption_handle: 'h9' }));

    first.readyState = MockWS.CLOSED;
    first.emit('close', { code: 1006 });
    await vi.advanceTimersByTimeAsync(500);

    const second = MockWS.instances[1];
    second.open();
    expect(JSON.parse(second.sent[0])).toMatchObject({
      model: 'm',
      thread_id: 't1',
      resumption_handle: 'h9',
    });
  });

  it('does NOT reconnect after an explicit close()', async () => {
    const s = newSession({ model: 'm', thread_id: 't1' });
    MockWS.instances[0].open();
    await s.ready;
    s.close();
    await vi.advanceTimersByTimeAsync(10000);
    expect(MockWS.instances).toHaveLength(1);
  });

  it('does NOT reconnect after a fatal error event', async () => {
    const s = newSession({ model: 'm', thread_id: 't1' });
    const ws = MockWS.instances[0];
    ws.open();
    await s.ready;
    ws.message(JSON.stringify({ type: 'error', message: 'boom', fatal: true }));
    ws.readyState = MockWS.CLOSED;
    ws.emit('close', { code: 1011 });
    await vi.advanceTimersByTimeAsync(10000);
    expect(MockWS.instances).toHaveLength(1);
  });

  it('stops after maxAttempts and emits a fatal error event', async () => {
    const errors: any[] = [];
    const s = newSession(
      { model: 'm', thread_id: 't1' },
      { reconnect: { baseDelay: 0.5, maxDelay: 10, maxAttempts: 2 } }
    );
    s.on('error', (e) => errors.push(e));
    MockWS.instances[0].open();
    await s.ready;

    let idx = 0;
    const dropAll = async () => {
      MockWS.instances[idx].readyState = MockWS.CLOSED;
      MockWS.instances[idx].emit('close', { code: 1006 });
      await vi.advanceTimersByTimeAsync(500);
      idx++;
      MockWS.instances[idx].readyState = MockWS.CLOSED;
      MockWS.instances[idx].emit('close', { code: 1006 });
      await vi.advanceTimersByTimeAsync(1000);
      idx++;
      MockWS.instances[idx].readyState = MockWS.CLOSED;
      MockWS.instances[idx].emit('close', { code: 1006 });
      await vi.advanceTimersByTimeAsync(5000);
    };
    await dropAll();

    expect(MockWS.instances).toHaveLength(3);
    expect(errors.some((e) => e.type === 'error' && e.fatal)).toBe(true);
  });

  it('emits the give-up failure only once even if the final socket closes again', async () => {
    const errors: any[] = [];
    const s = newSession(
      { model: 'm', thread_id: 't1' },
      { reconnect: { baseDelay: 0.5, maxDelay: 10, maxAttempts: 1 } }
    );
    s.on('error', (e) => errors.push(e));
    MockWS.instances[0].open();
    await s.ready;

    // Drop #0 -> one reconnect attempt -> socket #1.
    MockWS.instances[0].readyState = MockWS.CLOSED;
    MockWS.instances[0].emit('close', { code: 1006 });
    await vi.advanceTimersByTimeAsync(500);
    // Socket #1 drops -> attempts exhausted -> single give-up failure.
    MockWS.instances[1].readyState = MockWS.CLOSED;
    MockWS.instances[1].emit('close', { code: 1006 });
    await vi.advanceTimersByTimeAsync(5000);
    // A duplicate close on the same (current) socket must NOT re-emit the failure.
    MockWS.instances[1].emit('close', { code: 1006 });
    await vi.advanceTimersByTimeAsync(5000);

    const failures = errors.filter((e) => e.code === 'reconnect_failed');
    expect(failures).toHaveLength(1);
  });

  it('ignores a delayed close from a stale socket after reconnect', async () => {
    const s = newSession(
      { model: 'm', thread_id: 't1' },
      { reconnect: { baseDelay: 0.5, maxDelay: 10, maxAttempts: 5 } }
    );
    const first = MockWS.instances[0];
    first.open();
    await s.ready;

    // Drop #1 -> schedule reconnect -> new socket #2 opens.
    first.readyState = MockWS.CLOSED;
    first.emit('close', { code: 1006 });
    await vi.advanceTimersByTimeAsync(500);
    const second = MockWS.instances[1];
    second.open(); // resets reconnectAttempts to 0

    // A late, duplicate close from the STALE first socket must NOT spawn a 3rd socket.
    first.emit('close', { code: 1006 });
    await vi.advanceTimersByTimeAsync(10000);
    expect(MockWS.instances).toHaveLength(2);
  });
});

describe('TenxGraphClient.realtime', () => {
  beforeEach(() => {
    MockWS.instances = [];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens a RealtimeSession against /v1/graph/live using config auth', () => {
    const client = new TenxGraphClient({
      baseUrl: 'http://localhost:8000',
      authToken: 'tok',
      webSocketImpl: MockWS as any,
    });
    const session = client.realtime({ model: 'm', thread_id: 't1' });
    const ws = MockWS.instances[0];
    expect(ws.url).toBe('ws://localhost:8000/v1/graph/live');
    expect(ws.protocols).toEqual(['10xgraph-bearer', 'tok']);
    expect(session.threadId).toBe('t1');
  });
});
