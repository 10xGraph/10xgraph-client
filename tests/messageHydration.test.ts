import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TenxGraphClient } from '../src/client';
import { Message } from '../src/message';
import { serializeMessage } from '../src/endpoints/stream';

const assistantText = {
  message_id: 'm1',
  role: 'assistant',
  content: [{ type: 'text', text: 'Hello there', annotations: [] }],
  delta: false,
  timestamp: 1761301570.5,
  metadata: { run: 'r1' },
  usages: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
  tools_calls: undefined,
  server_extra: { keep: true },
};
const assistantToolCall = {
  message_id: 'm2',
  role: 'assistant',
  content: [{ type: 'tool_call', id: 'c1', name: 'get_weather', args: { city: 'Paris' } }],
  delta: false,
  timestamp: 1761301571.5,
  metadata: {},
};
const toolMessage = {
  message_id: 'm3',
  role: 'tool',
  content: [
    {
      type: 'tool_result',
      call_id: 'c1',
      name: 'get_weather',
      output: 'sunny',
      is_error: false,
      status: 'completed',
    },
  ],
  delta: false,
  timestamp: 1761301572.5,
  metadata: {},
};
const all = [assistantText, assistantToolCall, toolMessage];

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}
const meta = { request_id: 'r', timestamp: 't', message: 'OK' };

function expectHydrated(msgs: any[]) {
  expect(msgs).toHaveLength(3);
  for (const m of msgs) expect(m).toBeInstanceOf(Message);
  expect(msgs[0].text()).toBe('Hello there');
  expect(msgs[1].text()).toBe('');
  expect(msgs[2].text()).toBe('sunny');
  expect(msgs[0].message_id).toBe('m1');
  expect(msgs[0].timestamp).toBe(1761301570.5);
  expect(msgs[0].metadata).toEqual({ run: 'r1' });
  expect(msgs[0].usages).toEqual(assistantText.usages);
  expect(msgs[0].server_extra).toEqual({ keep: true });
  expect(msgs[1].content[0]).toMatchObject({
    type: 'tool_call',
    id: 'c1',
    args: { city: 'Paris' },
  });
  expect(msgs[2].content[0]).toMatchObject({ type: 'tool_result', call_id: 'c1', output: 'sunny' });
}

describe('server messages come back as Message instances', () => {
  let client: TenxGraphClient;
  beforeEach(() => {
    client = new TenxGraphClient({ baseUrl: 'http://localhost:8000', debug: false });
    global.fetch = vi.fn();
  });

  it('invoke: messages, all_messages and context', async () => {
    (global.fetch as any).mockResolvedValueOnce(
      ok({
        data: {
          messages: all,
          context: all,
          state: { context: all, context_summary: null, execution_meta: {} },
          meta: { is_new_thread: true, thread_id: 't1' },
        },
        metadata: meta,
      })
    );
    const result = await client.invoke([Message.text_message('hi')]);
    expectHydrated(result.messages);
    expectHydrated(result.all_messages);
    expectHydrated(result.context as any[]);
    expectHydrated((result.state as any).context);
    expect(result.messages[result.messages.length - 1]?.text()).toBe('sunny');
  });

  it('invoke: partial result callback gets instances', async () => {
    (global.fetch as any).mockResolvedValueOnce(
      ok({
        data: { messages: all, meta: { is_new_thread: true, thread_id: 't1' } },
        metadata: meta,
      })
    );
    const seen: any[] = [];
    await client.invoke([Message.text_message('hi')], {
      onPartialResult: (p) => {
        seen.push(p);
      },
    });
    expectHydrated(seen[0].messages);
  });

  it('stream: chunk.message and chunk.state.context', async () => {
    global.fetch = vi.fn().mockImplementation(() => {
      const enc = new TextEncoder();
      const lines = [
        ...all.map((m) => JSON.stringify({ event: 'message', message: m, thread_id: 't1' }) + '\n'),
        JSON.stringify({ event: 'state', state: { context: all } }) + '\n',
      ];
      return Promise.resolve({
        ok: true,
        status: 200,
        body: new ReadableStream({
          start(c) {
            for (const l of lines) c.enqueue(enc.encode(l));
            c.close();
          },
        }),
      });
    });
    const msgs: any[] = [];
    let state: any;
    for await (const chunk of client.stream([Message.text_message('hi')])) {
      if (chunk.message) msgs.push(chunk.message);
      if (chunk.state) state = chunk.state;
    }
    expectHydrated(msgs);
    expectHydrated(state.context);
  });

  it('threadMessages', async () => {
    (global.fetch as any).mockResolvedValueOnce(
      ok({ data: { messages: all, has_more: false }, metadata: meta })
    );
    const res = await client.threadMessages('t1', {});
    expectHydrated(res.data.messages);
    expect((res.data as any).has_more).toBe(false);
  });

  it('singleMessage', async () => {
    (global.fetch as any).mockResolvedValueOnce(ok({ data: assistantText, metadata: meta }));
    const res = await client.singleMessage('t1', 'm1');
    expect(res.data).toBeInstanceOf(Message);
    expect(res.data.text()).toBe('Hello there');
    expect((res.data as any).server_extra).toEqual({ keep: true });
  });

  it('threadState and updateThreadState', async () => {
    const state = { context: all, context_summary: 's', execution_meta: { step: 1 }, custom: 5 };
    (global.fetch as any).mockResolvedValueOnce(ok({ data: { state }, metadata: meta }));
    const res = await client.threadState('t1');
    expectHydrated(res.data.state.context);
    expect((res.data.state as any).custom).toBe(5);

    (global.fetch as any).mockResolvedValueOnce(ok({ data: { state }, metadata: meta }));
    const res2 = await client.updateThreadState('t1', {}, { context: [] });
    expectHydrated(res2.data.state.context);
  });

  it('a hydrated message serializes back to the server shape', async () => {
    (global.fetch as any).mockResolvedValueOnce(
      ok({
        data: { messages: all, meta: { is_new_thread: true, thread_id: 't1' } },
        metadata: meta,
      })
    );
    const result = await client.invoke([Message.text_message('hi')]);
    const wire = serializeMessage(result.messages[0]);
    expect(wire).toEqual({
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello there', annotations: [] }],
      message_id: 'm1',
      metadata: { run: 'r1' },
    });
    // and a full round trip: send hydrated messages in the next request body
    (global.fetch as any).mockResolvedValueOnce(
      ok({
        data: { messages: [], meta: { is_new_thread: false, thread_id: 't1' } },
        metadata: meta,
      })
    );
    await client.invoke(result.all_messages);
    const body = JSON.parse(((global.fetch as any).mock.calls[1][1] as any).body);
    expect(body.messages).toHaveLength(3);
    expect(body.messages[2].content[0]).toMatchObject({ type: 'tool_result', call_id: 'c1' });
    expect(body.messages[0].message_id).toBe('m1');
  });
});
