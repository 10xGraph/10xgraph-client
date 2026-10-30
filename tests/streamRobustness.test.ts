import { describe, it, expect, vi, afterEach } from 'vitest';
import { streamInvoke } from '../src/endpoints/stream';
import { invoke } from '../src/endpoints/invoke';
import { StreamError, RequestTimeoutError } from '../src/errors';
import { Message } from '../src/message';

const ctx = { baseUrl: 'http://localhost:8000', timeout: 5000, debug: false };
const req = { messages: [] as any[] };
const enc = new TextEncoder();

function line(obj: unknown): Uint8Array {
  return enc.encode(JSON.stringify(obj) + '\n');
}

/** A response whose body the test controls; records cancel(). */
function controlledResponse(onCancel?: () => void) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      onCancel?.();
    },
  });
  return { response: new Response(body, { status: 200 }), controller: () => controller };
}

/** fetch mock whose body errors with AbortError when the request signal aborts, like real fetch. */
function fetchReturning(response: Response, controller?: () => ReadableStreamDefaultController) {
  return vi.fn().mockImplementation((_u: string, init: RequestInit) => {
    init.signal?.addEventListener('abort', () => {
      try {
        controller?.().error(new DOMException('aborted', 'AbortError'));
      } catch {
        /* already closed */
      }
    });
    return Promise.resolve(response);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('G-13: breaking out of stream() cancels the request', () => {
  it('aborts the fetch signal and cancels the body on early break', async () => {
    let cancelled = false;
    const { response, controller } = controlledResponse(() => {
      cancelled = true;
    });
    let init: RequestInit | undefined;
    global.fetch = vi.fn().mockImplementation((_u: string, i: RequestInit) => {
      init = i;
      return Promise.resolve(response);
    });
    controller().enqueue(line({ event: 'message', data: {} }));

    for await (const _chunk of streamInvoke(ctx, req)) {
      break;
    }
    expect(init!.signal!.aborted).toBe(true);
    expect(cancelled).toBe(true);
  });
});

describe('G-138: timeout covers the stream body', () => {
  it('rejects with RequestTimeoutError when the body stalls', async () => {
    const { response, controller } = controlledResponse();
    global.fetch = fetchReturning(response, controller);
    controller().enqueue(line({ event: 'message', data: {} }));

    const gen = streamInvoke({ ...ctx, timeout: 100 }, req);
    const first = await gen.next();
    expect(first.done).toBe(false);
    await expect(gen.next()).rejects.toBeInstanceOf(RequestTimeoutError);
  });

  it('does not count time the consumer spends between chunks', async () => {
    const { response, controller } = controlledResponse();
    global.fetch = fetchReturning(response, controller);
    controller().enqueue(line({ event: 'message', data: 1 }));

    const gen = streamInvoke({ ...ctx, timeout: 100 }, req);
    await gen.next();
    await new Promise((r) => setTimeout(r, 250)); // slow consumer
    controller().enqueue(line({ event: 'message', data: 2 }));
    controller().close();
    const second = await gen.next();
    expect(second.value).toMatchObject({ data: 2 });
  });

  it('invoke(): the timeout covers reading the JSON body', async () => {
    const { response, controller } = controlledResponse(); // headers arrive, body never does
    global.fetch = fetchReturning(
      new Response(response.body, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
      controller
    );
    await expect(invoke({ ...ctx, timeout: 100 }, req)).rejects.toBeInstanceOf(RequestTimeoutError);
  });

  it('invoke(): a caller abort during the body read surfaces AbortError', async () => {
    const { response, controller } = controlledResponse();
    global.fetch = fetchReturning(
      new Response(response.body, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
      controller
    );
    const ac = new AbortController();
    const p = invoke({ ...ctx, signal: ac.signal }, req);
    setTimeout(() => ac.abort(), 30);
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('timeout 0 means no timeout', async () => {
    const { response, controller } = controlledResponse();
    global.fetch = fetchReturning(response, controller);
    const gen = streamInvoke({ ...ctx, timeout: 0 }, req);
    const next = gen.next();
    await new Promise((r) => setTimeout(r, 80));
    controller().enqueue(line({ event: 'message', data: 1 }));
    controller().close();
    expect((await next).value).toMatchObject({ data: 1 });
  });
});

describe('G-141: truncated or unparseable stream data is an error', () => {
  it('throws StreamError when the stream ends mid-line', async () => {
    const { response, controller } = controlledResponse();
    global.fetch = fetchReturning(response, controller);
    controller().enqueue(line({ event: 'message', data: 1 }));
    controller().enqueue(enc.encode('{"event":"error","data":{"mess'));
    controller().close();

    const seen: unknown[] = [];
    await expect(
      (async () => {
        for await (const c of streamInvoke(ctx, req)) seen.push(c);
      })()
    ).rejects.toBeInstanceOf(StreamError);
    expect(seen).toHaveLength(1);
  });

  it('throws StreamError for a complete line that is not JSON', async () => {
    const { response, controller } = controlledResponse();
    global.fetch = fetchReturning(response, controller);
    controller().enqueue(enc.encode('not json at all\n'));
    controller().close();
    await expect(
      (async () => {
        for await (const _c of streamInvoke(ctx, req)) void 0;
      })()
    ).rejects.toBeInstanceOf(StreamError);
  });

  it('wraps a connection reset as StreamError', async () => {
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        c.error(new TypeError('terminated'));
      },
    });
    global.fetch = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    await expect(
      (async () => {
        for await (const _c of streamInvoke(ctx, req)) void 0;
      })()
    ).rejects.toBeInstanceOf(StreamError);
  });

  it('passes an interrupted error chunk through and stops', async () => {
    const { response, controller } = controlledResponse();
    global.fetch = fetchReturning(response, controller);
    controller().enqueue(
      line({ event: 'error', data: { interrupted: true, message: 'shutdown', resume: 'x' } })
    );
    controller().close();
    const seen: any[] = [];
    for await (const c of streamInvoke(ctx, req)) seen.push(c);
    expect(seen).toHaveLength(1);
    expect(seen[0].data.interrupted).toBe(true);
  });
});

describe('G-140 / G-153: recursion limit', () => {
  const toolMsg = {
    role: 'assistant',
    content: [{ type: 'remote_tool_call', id: 'c1', name: 't', args: {} }],
    message_id: 'm',
  };
  const executor = {
    executeToolCalls: () => Promise.resolve([Message.text_message('r', 'tool')]),
  } as any;

  it('invoke(): recursion_limit_reached is false after a normal last iteration', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            messages: [{ role: 'assistant', content: [{ type: 'text', text: 'hi' }] }],
            meta: {},
          },
          metadata: {},
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    const r = await invoke({ ...ctx }, { messages: [], recursion_limit: 1 });
    expect(r.iterations).toBe(1);
    expect(r.recursion_limit_reached).toBe(false);
  });

  it('invoke(): true when the limit stops a loop that still wants tools', async () => {
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: { messages: [toolMsg], meta: {} }, metadata: {} }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
    );
    const r = await invoke(
      { ...ctx, toolExecutor: executor },
      { messages: [], recursion_limit: 2 }
    );
    expect(r.recursion_limit_reached).toBe(true);
    expect(r.iterations).toBe(2);
  });

  it('stream(): a limit stop yields a visible error chunk', async () => {
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(line({ event: 'message', message: toolMsg }));
              c.close();
            },
          }),
          { status: 200 }
        )
      )
    );
    const seen: any[] = [];
    for await (const c of streamInvoke(
      { ...ctx, toolExecutor: executor },
      { messages: [], recursion_limit: 2 }
    ))
      seen.push(c);
    const last = seen[seen.length - 1];
    expect(last.event).toBe('error');
    expect(last.data.recursion_limit_reached).toBe(true);
  });

  it('stream(): recursion_limit 0 behaves like invoke (one request, no loop)', async () => {
    const f = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(new ReadableStream({ start: (c) => c.close() }), { status: 200 })
        )
      );
    global.fetch = f;
    for await (const _c of streamInvoke(ctx, { messages: [], recursion_limit: 0 })) void 0;
    expect(f).toHaveBeenCalledTimes(1);
    expect(JSON.parse(f.mock.calls[0][1].body).recursion_limit).toBe(0);
  });
});

describe('G-152: empty arrays survive serialization', () => {
  it('keeps an empty output array on a tool result block', async () => {
    const { serializeMessage } = await import('../src/endpoints/stream');
    const m = serializeMessage({
      role: 'tool',
      content: [{ type: 'tool_result', call_id: 'c', output: [], is_error: false }],
      message_id: null,
    } as any);
    expect(m.content[0].output).toEqual([]);
  });
});

describe('G-142 / G-150: invoke response guard and endpoint names', () => {
  it('a body without data.messages does not crash', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { meta: {} }, metadata: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const r = await invoke(ctx, { messages: [] });
    expect(r.messages).toEqual([]);
  });
  it('an HTTP error names the real route', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: 'x' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      })
    );
    await expect(invoke(ctx, { messages: [] })).rejects.toMatchObject({
      endpoint: '/v1/graph/invoke',
    });
  });
});
