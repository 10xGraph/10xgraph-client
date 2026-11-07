import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TenxGraphClient, NotFoundError, ValidationError } from '../src/index';

const fetchMock = vi.fn();
global.fetch = fetchMock;

const metadata = { request_id: 'r1', timestamp: '2026-11-07T00:00:00', message: 'OK' };

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data, metadata }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function fail(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ metadata, error: { code, message, details: [] } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function call() {
  const [url, init] = fetchMock.mock.calls[0];
  return { url: url as string, init: init as RequestInit & { headers: Record<string, string> } };
}

describe('background task methods', () => {
  let client: TenxGraphClient;

  beforeEach(() => {
    fetchMock.mockReset();
    client = new TenxGraphClient({ baseUrl: 'http://localhost:8000', authToken: 'tok' });
  });

  it('runTask posts args and kwargs and returns the task id', async () => {
    fetchMock.mockResolvedValue(ok({ task_id: 't-1' }, 202));
    const res = await client.runTask('web_add', { args: [1], kwargs: { b: 2 } });
    const { url, init } = call();
    expect(url).toBe('http://localhost:8000/v1/tasks/web_add');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body as string)).toEqual({ args: [1], kwargs: { b: 2 } });
    expect(res.data.task_id).toBe('t-1');
  });

  it('runTask defaults to empty args and kwargs and encodes the name', async () => {
    fetchMock.mockResolvedValue(ok({ task_id: 't-1' }, 202));
    await client.runTask('a/b');
    const { url, init } = call();
    expect(url).toBe('http://localhost:8000/v1/tasks/a%2Fb');
    expect(JSON.parse(init.body as string)).toEqual({ args: [], kwargs: {} });
  });

  it('scheduleTask sends the schedule and returns the schedule id', async () => {
    fetchMock.mockResolvedValue(ok({ schedule_id: 's-1' }, 202));
    const res = await client.scheduleTask('web_add', {
      kwargs: { a: 1 },
      schedule: { every: 3 },
    });
    const { url, init } = call();
    expect(url).toBe('http://localhost:8000/v1/tasks/web_add');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body as string)).toEqual({
      args: [],
      kwargs: { a: 1 },
      schedule: { every: 3 },
    });
    expect(res.data.schedule_id).toBe('s-1');
  });

  it('scheduleTask serialises a Date as an ISO time', async () => {
    fetchMock.mockResolvedValue(ok({ schedule_id: 's-1' }, 202));
    const at = new Date('2026-12-01T10:00:00Z');
    await client.scheduleTask('web_add', { schedule: { at } });
    expect(JSON.parse(call().init.body as string).schedule).toEqual({ at: at.toISOString() });
  });

  it('getTask reads a task record', async () => {
    const record = {
      task_id: 't-1',
      task_name: 'web_add',
      status: 'success',
      owner: 'u1',
      created_at: 1,
      updated_at: 2,
      progress: null,
      result: 3,
      error: null,
    };
    fetchMock.mockResolvedValue(ok(record));
    const res = await client.getTask('t-1');
    const { url, init } = call();
    expect(url).toBe('http://localhost:8000/v1/tasks/t-1');
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.body).toBeUndefined();
    expect(res.data).toEqual(record);
  });

  it('getTask reads a schedule record', async () => {
    const record = {
      schedule_id: 's-1',
      task_name: 'web_add',
      owner: 'u1',
      schedule: { every: 3 },
      args: [],
      kwargs: {},
      created_at: 1,
    };
    fetchMock.mockResolvedValue(ok(record));
    const res = await client.getTask('s-1');
    expect('schedule_id' in res.data).toBe(true);
  });

  it('rescheduleTask patches the schedule', async () => {
    fetchMock.mockResolvedValue(ok({ schedule_id: 's-1', schedule: { cron: '* * * * *' } }));
    const res = await client.rescheduleTask('s-1', { cron: '* * * * *' });
    const { url, init } = call();
    expect(url).toBe('http://localhost:8000/v1/tasks/s-1');
    expect(init.method).toBe('PATCH');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body as string)).toEqual({ schedule: { cron: '* * * * *' } });
    expect(res.data.schedule_id).toBe('s-1');
  });

  it('cancelTask posts to the cancel path', async () => {
    fetchMock.mockResolvedValue(ok({ task_id: 't-1', status: 'cancelled' }));
    const res = await client.cancelTask('t-1');
    const { url, init } = call();
    expect(url).toBe('http://localhost:8000/v1/tasks/t-1/cancel');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(res.data).toEqual({ task_id: 't-1', status: 'cancelled' });
  });

  it('cancelTask on a schedule returns deleted', async () => {
    fetchMock.mockResolvedValue(ok({ schedule_id: 's-1', deleted: true }));
    const res = await client.cancelTask('s-1');
    expect(res.data).toEqual({ schedule_id: 's-1', deleted: true });
  });

  it('maps 404 to NotFoundError', async () => {
    fetchMock.mockResolvedValue(fail(404, 'HTTP_404', 'Task not found'));
    const err = await client.getTask('nope').catch((e) => e);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Task not found');
  });

  it('maps 422 to ValidationError', async () => {
    fetchMock.mockResolvedValue(fail(422, 'VALIDATION_ERROR', 'reserved argument: ctx'));
    const err = await client.runTask('web_add', { kwargs: { ctx: 1 } }).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.statusCode).toBe(422);
  });
});
