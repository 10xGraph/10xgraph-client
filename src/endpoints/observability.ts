import { ResponseMetadata } from './metadata.js';
import { createErrorFromResponse } from '../errors.js';
import { buildHeaders, getRequestCredentials, RequestContext } from '../request.js';

export interface ObservabilityContext extends RequestContext {}

/** Compact view of a complete message seen during a node visit. */
export interface ObsMessageSummary {
  role: 'user' | 'assistant' | 'tool' | 'system' | string;
  text?: string;
  tool_calls?: Array<{ id: string; name: string }>;
  tool_results?: Array<{ call_id: string; is_error: boolean }>;
}

/**
 * One span in the run tree: `root` > `node` (one per visit) > `llm` and `tool`.
 * The tree is built from `parent`. Fields marked 1.0.0 are absent on older servers.
 * Values in `inputs` / `outputs` are clipped at 4000 characters
 * (a clipped value is a string ending in `...[truncated N chars]`).
 *
 * `inputs` / `outputs` by kind:
 * - root: `{ user_message }` / `{ assistant_message }`
 * - node: `{ incoming_message }` (approximate) / `{ messages: ObsMessageSummary[] }`
 * - llm: `null` (the prompt is not recorded) / `{ text?, tool_calls? }`
 * - tool: `{ args }` / `{ result }`
 */
export interface ObsSpan {
  id: string;
  name: string;
  kind: 'root' | 'node' | 'llm' | 'tool';
  parent: string | null;
  start_ms: number;
  duration_ms: number;
  model?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  /** ok | error | running. */
  status?: 'ok' | 'error' | 'running';
  /** Error text when `status` is `error`. */
  error?: string | null;
  inputs?: Record<string, unknown> | null;
  outputs?: Record<string, unknown> | null;
  /** Graph step (node spans), else null. */
  step?: number | null;
  /** 1-based visit count of this node name (node spans), else null. */
  visit?: number | null;
  total_tokens?: number | null;
  reasoning_tokens?: number | null;
  /** Tool spans only. */
  tool_name?: string | null;
  tool_call_id?: string | null;
}

export interface ObsEvent {
  id: string;
  type: string;
  node: string;
  offset_ms: number;
  summary: string;
}

export interface ObsTokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
}

export interface ObsRun {
  run_id: string;
  thread_id: string;
  status: string;
  started_at: number | null;
  finished_at: number | null;
  duration_ms: number;
  spans: ObsSpan[];
  events: ObsEvent[];
  usage: ObsTokenUsage;
  llm_calls: number;
  tool_calls: number;
  /** Number of node visits (distinct node names on servers older than 1.0.0). */
  iterations: number;
  /** First error text seen in the run, else null. */
  error?: string | null;
  /** First model seen in the run, else null. */
  model?: string | null;
  models?: string[];
  /** Human-readable limits of this run's trace (may be empty). */
  notes?: string[];
}

/** Why `run` is null. */
export type ObsEmptyReason = 'disabled_in_production' | 'store_unavailable' | 'no_runs';

export interface ObservabilityData {
  thread_id: string;
  run_count: number;
  run_ids: string[];
  run: ObsRun | null;
  /** False when the local trace store is off (for example MODE=production). */
  enabled?: boolean;
  /** Why `run` is null: tracing off, store missing, or no runs captured yet. */
  reason?: ObsEmptyReason | null;
}

export interface ObservabilityResponse {
  data: ObservabilityData;
  metadata: ResponseMetadata;
}

/**
 * Fetch the reconstructed observability trace (spans, events, cost) for a thread.
 * Returns the latest run by default, or a specific run when `runId` is given.
 */
export async function observability(
  context: ObservabilityContext,
  threadId: string,
  runId?: string
): Promise<ObservabilityResponse> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), context.timeout);

    const query = runId ? `?run_id=${encodeURIComponent(runId)}` : '';
    const response = await fetch(
      `${context.baseUrl}/v1/observability/${encodeURIComponent(threadId)}${query}`,
      {
        method: 'GET',
        headers: buildHeaders(context as RequestContext, {
          'Content-Type': 'application/json',
          accept: 'application/json',
        }),
        ...getRequestCredentials(context as RequestContext),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await createErrorFromResponse(
        response,
        'Observability fetch failed',
        `/v1/observability/${threadId}`,
        'GET'
      );
      throw error;
    }

    return (await response.json()) as ObservabilityResponse;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error(`Request timeout after ${context.timeout}ms`);
    }
    throw error;
  }
}
