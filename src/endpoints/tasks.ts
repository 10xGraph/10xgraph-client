import { ResponseMetadata } from './metadata.js';
import { createErrorFromResponse } from '../errors.js';
import {
  buildHeaders,
  getRequestCredentials,
  RequestContext,
  fetchWithTimeout,
  encodePathSegment,
} from '../request.js';

export interface TasksContext extends RequestContext {}

export type TaskStatus = 'queued' | 'running' | 'success' | 'failure' | 'cancelled';

/** Exactly one of `cron`, `at` or `every`. The server validates it and answers 422. */
export type TaskSchedule =
  | { cron: string; at?: never; every?: never }
  | { at: string | Date; cron?: never; every?: never }
  | { every: number; cron?: never; at?: never };

export interface TaskCallOptions {
  args?: unknown[];
  kwargs?: Record<string, unknown>;
}

export interface RunTaskResponse {
  data: { task_id: string };
  metadata: ResponseMetadata;
}

export interface ScheduleTaskRequest extends TaskCallOptions {
  schedule: TaskSchedule;
}

export interface ScheduleTaskResponse {
  data: { schedule_id: string };
  metadata: ResponseMetadata;
}

export interface TaskProgress {
  [key: string]: unknown;
}

export interface TaskRecord {
  task_id: string;
  task_name: string;
  status: TaskStatus;
  owner: string | null;
  created_at: number;
  updated_at: number;
  progress: TaskProgress | null;
  result: unknown;
  error: string | null;
}

/** `at` comes back as an ISO string. */
export interface ScheduleRecord {
  schedule_id: string;
  task_name: string;
  owner: string;
  schedule: { cron?: string | null; at?: string | null; every?: number | null };
  args: unknown[];
  kwargs: Record<string, unknown>;
  created_at: number;
}

/** A task id answers with a `TaskRecord`, a schedule id with a `ScheduleRecord`. */
export interface GetTaskResponse {
  data: TaskRecord | ScheduleRecord;
  metadata: ResponseMetadata;
}

export interface RescheduleTaskResponse {
  data: ScheduleRecord;
  metadata: ResponseMetadata;
}

export interface CancelTaskResponse {
  data: { task_id: string; status: TaskStatus } | { schedule_id: string; deleted: boolean };
  metadata: ResponseMetadata;
}

async function callTasks<T>(
  context: TasksContext,
  label: string,
  path: string,
  method: 'GET' | 'POST' | 'PATCH',
  body?: unknown
): Promise<T> {
  try {
    const url = `${context.baseUrl}${path}`;
    if (context.debug) {
      console.debug(`TenxGraphClient: ${label}:`, method, url);
    }

    const response = await fetchWithTimeout(context, url, {
      method,
      headers: buildHeaders(
        context as RequestContext,
        body === undefined
          ? { accept: 'application/json' }
          : { 'Content-Type': 'application/json', accept: 'application/json' }
      ),
      ...getRequestCredentials(context as RequestContext),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    if (!response.ok) {
      console.warn(`TenxGraphClient: ${label} failed with HTTP ${response.status}`);
      throw await createErrorFromResponse(response, `${label} request failed`, path, method);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (context.debug) {
      console.debug(`TenxGraphClient: ${label} failed:`, error);
    }
    throw error;
  }
}

/** Run an `http=True` task now. Answers 202 with the task id. */
export function runTask(
  context: TasksContext,
  name: string,
  options: TaskCallOptions = {}
): Promise<RunTaskResponse> {
  return callTasks(context, 'Run task', `/v1/tasks/${encodePathSegment(name)}`, 'POST', {
    args: options.args ?? [],
    kwargs: options.kwargs ?? {},
  });
}

/** Schedule an `http=True` task. Answers 202 with the schedule id (501 without Redis). */
export function scheduleTask(
  context: TasksContext,
  name: string,
  request: ScheduleTaskRequest
): Promise<ScheduleTaskResponse> {
  return callTasks(context, 'Schedule task', `/v1/tasks/${encodePathSegment(name)}`, 'POST', {
    args: request.args ?? [],
    kwargs: request.kwargs ?? {},
    schedule: request.schedule,
  });
}

/** Read a task (status, progress, result, error) or a schedule by id. */
export function getTask(context: TasksContext, id: string): Promise<GetTaskResponse> {
  return callTasks(context, 'Get task', `/v1/tasks/${encodePathSegment(id)}`, 'GET');
}

/** Change the time of a schedule. Arguments stay as they were. */
export function rescheduleTask(
  context: TasksContext,
  scheduleId: string,
  schedule: TaskSchedule
): Promise<RescheduleTaskResponse> {
  return callTasks(
    context,
    'Reschedule task',
    `/v1/tasks/${encodePathSegment(scheduleId)}`,
    'PATCH',
    { schedule }
  );
}

/** Cancel a task, or delete a schedule. */
export function cancelTask(context: TasksContext, id: string): Promise<CancelTaskResponse> {
  return callTasks(context, 'Cancel task', `/v1/tasks/${encodePathSegment(id)}/cancel`, 'POST', {});
}
