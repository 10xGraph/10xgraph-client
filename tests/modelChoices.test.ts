import { describe, it, expect, vi } from 'vitest';
import { TenxGraphClient } from '../src/client';
import type { GraphInfo, GraphResponse } from '../src/index';

describe('graph info models', () => {
  it('exposes per-node model choices and keeps them optional', async () => {
    const body = {
      data: {
        info: {
          node_count: 1,
          models: { MAIN: { default: 'gpt', names: ['gpt', 'vllm'], config_key: 'model' } },
        },
        nodes: [],
        edges: [],
      },
      metadata: { request_id: 'r', timestamp: 't', message: 'm' },
    } as unknown as GraphResponse;
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => body });
    const client = new TenxGraphClient({ baseUrl: 'http://localhost:8000' });

    const res = await client.graph();
    expect(res.data.info.models?.MAIN.names).toEqual(['gpt', 'vllm']);

    // Older servers send no `models`: the field is optional.
    const older = {} as Pick<GraphInfo, 'models'>;
    expect(older.models).toBeUndefined();
  });

  it('accepts config.model on invoke and stream options', () => {
    const options: NonNullable<Parameters<TenxGraphClient['invoke']>[1]> = {
      config: { model: 'vllm' },
    };
    const streamOptions: NonNullable<Parameters<TenxGraphClient['stream']>[1]> = {
      config: { model: 'vllm' },
    };
    expect(options.config?.model).toBe('vllm');
    expect(streamOptions.config?.model).toBe('vllm');
  });
});
