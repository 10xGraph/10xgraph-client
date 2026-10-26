import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TenxGraphClient, Message, ConflictError, TenxGraphError } from '../src/index';

const invokeOk = {
  data: {
    messages: [
      {
        message_id: '1',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hi' }],
        delta: false,
        timestamp: Date.now(),
        metadata: {},
      },
    ],
    meta: { is_new_thread: false, thread_id: 't1' },
  },
  metadata: { request_id: 'r', timestamp: new Date().toISOString(), message: 'OK' },
};

function ndjsonResponse(): any {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(
          JSON.stringify({ event: 'updates', data: {}, thread_id: 't1', metadata: {} }) + '\n'
        )
      );
      controller.close();
    },
  });
  return { ok: true, status: 200, body };
}

function sentBody(fetchMock: any): Record<string, any> {
  return JSON.parse(fetchMock.mock.calls[0][1].body);
}

describe('on_busy / resume / interrupt_id', () => {
  let client: TenxGraphClient;
  const messages = [Message.text_message('Hello', 'user')];

  beforeEach(() => {
    client = new TenxGraphClient({ baseUrl: 'http://localhost:8000', debug: false });
  });

  describe('invoke', () => {
    it('sends the fields when set', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => invokeOk });
      global.fetch = fetchMock as any;
      await client.invoke(messages, {
        on_busy: 'cancel',
        resume: { approved: true },
        interrupt_id: 'int-1',
      });
      const body = sentBody(fetchMock);
      expect(body.on_busy).toBe('cancel');
      expect(body.resume).toEqual({ approved: true });
      expect(body.interrupt_id).toBe('int-1');
    });

    it('omits the fields when not set', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => invokeOk });
      global.fetch = fetchMock as any;
      await client.invoke(messages);
      const body = sentBody(fetchMock);
      expect(body).not.toHaveProperty('on_busy');
      expect(body).not.toHaveProperty('resume');
      expect(body).not.toHaveProperty('interrupt_id');
    });

    it('maps HTTP 409 {"detail": ...} to ConflictError', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ detail: 'thread is busy' }),
      }) as any;
      const err = await client.invoke(messages).catch((e) => e);
      expect(err).toBeInstanceOf(ConflictError);
      expect(err).toBeInstanceOf(TenxGraphError);
      expect(err.statusCode).toBe(409);
      expect(err.message).toBe('thread is busy');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('stream', () => {
    it('sends the fields when set', async () => {
      const fetchMock = vi.fn().mockImplementation(async () => ndjsonResponse());
      global.fetch = fetchMock as any;
      for await (const _ of client.stream(messages, {
        on_busy: 'wait',
        resume: 'yes',
        interrupt_id: 'int-2',
      })) {
        // drain
      }
      const body = sentBody(fetchMock);
      expect(body.on_busy).toBe('wait');
      expect(body.resume).toBe('yes');
      expect(body.interrupt_id).toBe('int-2');
    });

    it('omits the fields when not set', async () => {
      const fetchMock = vi.fn().mockImplementation(async () => ndjsonResponse());
      global.fetch = fetchMock as any;
      for await (const _ of client.stream(messages)) {
        // drain
      }
      const body = sentBody(fetchMock);
      expect(body).not.toHaveProperty('on_busy');
      expect(body).not.toHaveProperty('resume');
      expect(body).not.toHaveProperty('interrupt_id');
    });

    it('maps HTTP 409 to ConflictError', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ detail: 'thread is busy' }),
      }) as any;
      const run = async () => {
        for await (const _ of client.stream(messages)) {
          // drain
        }
      };
      await expect(run()).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe('wsStream', () => {
    const sent: string[] = [];
    class FakeWS {
      readyState = 1;
      private listeners: Record<string, Array<(e: any) => void>> = {};
      constructor() {}
      addEventListener(type: string, fn: (e: any) => void): void {
        (this.listeners[type] ??= []).push(fn);
      }
      send(data: string): void {
        sent.push(data);
        queueMicrotask(() => {
          const done = { data: JSON.stringify({ event: 'updates', data: { status: 'done' } }) };
          (this.listeners['message'] ?? []).forEach((fn) => fn(done));
        });
      }
      close(): void {
        this.readyState = 3;
      }
    }

    beforeEach(() => {
      sent.length = 0;
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('sends the fields when set', async () => {
      const wsClient = new TenxGraphClient({
        baseUrl: 'http://localhost:8000',
        webSocketImpl: FakeWS as any,
      });
      for await (const _ of wsClient.wsStream(messages, {
        on_busy: 'cancel',
        resume: { ok: 1 },
        interrupt_id: 'int-3',
      })) {
        // drain
      }
      const body = JSON.parse(sent[0]);
      expect(body.invoke_type).toBe('fresh');
      expect(body.on_busy).toBe('cancel');
      expect(body.resume).toEqual({ ok: 1 });
      expect(body.interrupt_id).toBe('int-3');
    });

    it('omits the fields when not set', async () => {
      const wsClient = new TenxGraphClient({
        baseUrl: 'http://localhost:8000',
        webSocketImpl: FakeWS as any,
      });
      for await (const _ of wsClient.wsStream(messages)) {
        // drain
      }
      const body = JSON.parse(sent[0]);
      expect(body).not.toHaveProperty('on_busy');
      expect(body).not.toHaveProperty('resume');
      expect(body).not.toHaveProperty('interrupt_id');
    });
  });
});
