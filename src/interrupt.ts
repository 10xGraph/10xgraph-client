import type { StreamChunk } from './endpoints/stream.js';

/**
 * A pause raised by `interrupt()` in a graph node or tool, waiting for a resume value.
 * Mirrors the server payload at `chunk.data.interrupt` of an `updates` chunk whose
 * `status` is `"interrupted"`.
 */
export interface Interrupt {
  /** Unique id of this pause; echo it as `interrupt_id` when resuming. */
  id: string;
  /** Stable position of the call within its node or tool call. */
  key: string;
  /** Node that was running when the graph paused. */
  node: string;
  /** Payload passed to `interrupt()`: what to approve or choose from. */
  value?: unknown;
  /** Human-readable prompt. */
  message?: string | null;
  /** Machine-readable reason, for example `"tool_approval"`. */
  reason: string;
  /** JSON Schema the resume value must follow. */
  response_schema?: Record<string, unknown> | null;
  /** Tool call that paused, when `interrupt()` ran inside a tool. */
  tool_call_id?: string | null;
}

/** Spread into the `options` of `invoke`, `stream` or `wsStream` to answer an interrupt. */
export interface InterruptResume {
  resume: unknown;
  interrupt_id: string;
}

/** The pending interrupt carried by a stream chunk, or null when the chunk has none. */
export function getInterrupt(chunk: Pick<StreamChunk, 'event' | 'data'>): Interrupt | null {
  const data = chunk.data;
  if (chunk.event !== 'updates' || data === null || typeof data !== 'object') return null;
  const found = (data as { interrupt?: unknown }).interrupt;
  if (found === null || typeof found !== 'object') return null;
  return typeof (found as Interrupt).id === 'string' ? (found as Interrupt) : null;
}

/**
 * Answer an interrupt with approval. `value` is what the interrupted code receives; it
 * defaults to `true`. When the interrupt sets `response_schema`, pass a value that matches it.
 *
 * ```ts
 * await client.invoke([], { config: { thread_id }, ...approveInterrupt(interrupt) });
 * ```
 */
export function approveInterrupt(interrupt: Interrupt, value: unknown = true): InterruptResume {
  return { resume: value, interrupt_id: interrupt.id };
}

/**
 * Answer an interrupt with a cancel. The server resumes the interrupted code with `null`
 * and does not check it against `response_schema`.
 */
export function rejectInterrupt(interrupt: Interrupt): InterruptResume {
  return { resume: null, interrupt_id: interrupt.id };
}
