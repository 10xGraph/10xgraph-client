import { describe, it, expect, vi } from 'vitest';
import { TenxGraphClient } from '../src/client';
import type { GraphResponse } from '../src/index';

describe('graph info realtime_options', () => {
  it('exposes realtime_options and allows null', async () => {
    const info = {
      node_count: 1,
      edge_count: 0,
      checkpointer: false,
      checkpointer_type: '',
      publisher: false,
      store: false,
      interrupt_before: [],
      interrupt_after: [],
      context_type: '',
      id_generator: '',
      id_type: '',
      state_type: '',
      state_fields: [],
    };
    const withOpts: GraphResponse = {
      data: {
        info: {
          ...info,
          realtime_options: {
            client_overrides: ['voice'],
            models: ['m'],
            model_selectable: true,
            tools_tags: true,
          },
        },
        graph: { nodes: [], edges: [] },
      },
      metadata: { request_id: 'r', timestamp: 't', message: 'm' },
    } as unknown as GraphResponse;
    const nullOpts = JSON.parse(JSON.stringify(withOpts));
    nullOpts.data.info.realtime_options = null;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => withOpts })
      .mockResolvedValueOnce({ ok: true, json: async () => nullOpts });
    global.fetch = fetchMock;
    const client = new TenxGraphClient({ baseUrl: 'http://localhost:8000' });

    const a = await client.graph();
    expect(a.data.info.realtime_options?.client_overrides).toEqual(['voice']);
    const b = await client.graph();
    expect(b.data.info.realtime_options).toBeNull();
  });
});
