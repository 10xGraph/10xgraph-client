import type { WebSocketImpl } from './ws.js';
import { NetworkError, RequestTimeoutError, TenxGraphError } from './errors.js';

export interface TenxGraphBearerAuth {
  type: 'bearer';
  token: string;
}

export interface TenxGraphBasicAuth {
  type: 'basic';
  username: string;
  password: string;
}

export interface TenxGraphHeaderAuth {
  type: 'header';
  name: string;
  value: string;
  prefix?: string | null;
}

export type TenxGraphAuth = TenxGraphBearerAuth | TenxGraphBasicAuth | TenxGraphHeaderAuth;

/**
 * Abort `controller` when the caller's `signal` aborts. Returns a cleanup function.
 * A signal that is already aborted aborts the controller immediately.
 */
export function linkAbortSignal(
  controller: AbortController,
  signal?: AbortSignal | null
): () => void {
  if (!signal) return () => {};
  if (signal.aborted) {
    controller.abort();
    return () => {};
  }
  const onAbort = (): void => controller.abort();
  signal.addEventListener('abort', onAbort, { once: true });
  return () => signal.removeEventListener('abort', onAbort);
}

/** Per-call options accepted by every client method that makes a request. */
export interface RequestOptions {
  /** Abort to cancel the request. Rejects with the signal's AbortError, never as a timeout. */
  signal?: AbortSignal;
}

export interface RequestContext {
  baseUrl: string;
  authToken?: string | null;
  auth?: TenxGraphAuth | null;
  headers?: HeadersInit;
  credentials?: RequestCredentials;
  timeout: number;
  debug: boolean;
  webSocketImpl?: WebSocketImpl;
  /** Caller's cancellation signal for this call. Set per call by the client, not stored. */
  signal?: AbortSignal;
}

function setHeader(
  target: Record<string, string>,
  name: string,
  value: string | null | undefined
): void {
  if (value == null) {
    return;
  }

  for (const existingName of Object.keys(target)) {
    if (existingName.toLowerCase() === name.toLowerCase()) {
      delete target[existingName];
    }
  }

  target[name] = value;
}

function mergeHeaders(target: Record<string, string>, source?: HeadersInit | null): void {
  if (!source) {
    return;
  }

  if (source instanceof Headers) {
    source.forEach((value, name) => {
      setHeader(target, name, value);
    });
    return;
  }

  if (Array.isArray(source)) {
    for (const [name, value] of source) {
      setHeader(target, name, value);
    }
    return;
  }

  for (const [name, value] of Object.entries(source)) {
    if (value !== undefined) {
      setHeader(target, name, String(value));
    }
  }
}

function hasHeader(target: Record<string, string>, name: string): boolean {
  return Object.keys(target).some(
    (existingName) => existingName.toLowerCase() === name.toLowerCase()
  );
}

function encodeBase64(value: string): string {
  const bufferConstructor = (
    globalThis as {
      Buffer?: { from(input: string, encoding: string): { toString(encoding: string): string } };
    }
  ).Buffer;
  if (bufferConstructor) {
    return bufferConstructor.from(value, 'utf-8').toString('base64');
  }

  if (typeof btoa === 'function') {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }

  throw new Error('Basic authentication is not supported in this runtime');
}

function applyAuth(target: Record<string, string>, auth?: TenxGraphAuth | null): void {
  if (!auth) {
    return;
  }

  if (auth.type === 'bearer') {
    setHeader(target, 'Authorization', `Bearer ${auth.token}`);
    return;
  }

  if (auth.type === 'basic') {
    const credentials = encodeBase64(`${auth.username}:${auth.password}`);
    setHeader(target, 'Authorization', `Basic ${credentials}`);
    return;
  }

  const headerValue = auth.prefix ? `${auth.prefix} ${auth.value}` : auth.value;
  setHeader(target, auth.name, headerValue);
}

export function buildHeaders(
  context: Pick<RequestContext, 'authToken' | 'auth' | 'headers'>,
  defaults?: HeadersInit
): Record<string, string> {
  const headers: Record<string, string> = {};

  mergeHeaders(headers, defaults);
  mergeHeaders(headers, context.headers);

  if (context.auth) {
    applyAuth(headers, context.auth);
  } else if (context.authToken && !hasHeader(headers, 'Authorization')) {
    setHeader(headers, 'Authorization', `Bearer ${context.authToken}`);
  }

  return headers;
}

export function getRequestCredentials(
  context: Pick<RequestContext, 'credentials'>
): Pick<RequestInit, 'credentials'> | Record<string, never> {
  if (!context.credentials) {
    return {};
  }

  return { credentials: context.credentials };
}

export function bearerAuth(token: string): TenxGraphBearerAuth {
  return { type: 'bearer', token };
}

export function basicAuth(username: string, password: string): TenxGraphBasicAuth {
  return { type: 'basic', username, password };
}

export function headerAuth(
  name: string,
  value: string,
  prefix?: string | null
): TenxGraphHeaderAuth {
  return { type: 'header', name, value, prefix };
}

/** Percent-encode one URL path segment (thread, message or memory id). */
export function encodePathSegment(value: string | number): string {
  return encodeURIComponent(String(value));
}

/** Strip trailing slashes so `${baseUrl}/path` never produces `//path`. */
export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

const MAX_REDIRECTS = 5;

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/**
 * fetch with the shared client policy:
 * - the timeout timer is always cleared (also when fetch rejects) and does not keep a Node
 *   process alive;
 * - `context.signal` cancels the call (rejects with the AbortError, never as a timeout);
 * - a timeout throws RequestTimeoutError, any other fetch rejection throws NetworkError
 *   with the original error as `cause`;
 * - with header-type credentials other than Authorization (e.g. X-API-Key, which fetch does not
 *   strip on a redirect)
 *   redirects are followed only within the same origin; a cross-origin redirect is refused.
 */
export async function fetchWithTimeout(
  context: Pick<RequestContext, 'timeout' | 'signal' | 'auth'>,
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const timer =
    context.timeout > 0 ? setTimeout(() => controller.abort(), context.timeout) : undefined;
  (timer as unknown as { unref?: () => void } | undefined)?.unref?.();
  const unlink = linkAbortSignal(controller, context.signal);
  const method = (init.method || 'GET').toUpperCase();
  // fetch strips the standard Authorization header on a cross-origin redirect (checked against
  // Node's undici), but forwards any other custom header, so only those need the guard.
  const guardRedirects =
    context.auth?.type === 'header' && context.auth.name.toLowerCase() !== 'authorization';

  try {
    let currentUrl = url;
    let currentInit: RequestInit = { ...init, signal: controller.signal };
    if (guardRedirects) currentInit.redirect = 'manual';

    for (let hops = 0; ; hops++) {
      const response = await fetch(currentUrl, currentInit);
      if (guardRedirects && response.type === 'opaqueredirect') {
        // Browsers hide the Location of a manual redirect, so it cannot be followed or checked.
        throw new NetworkError(
          'The server redirected the request and the browser does not expose the target, so it ' +
            'was not followed (header credentials must not be sent to another origin). ' +
            'Point baseUrl at the final URL.',
          pathOf(url),
          method
        );
      }
      if (!guardRedirects || !(response.status >= 300 && response.status < 400)) {
        return response;
      }
      const location = response.headers?.get('location');
      const target = location ? new URL(location, currentUrl).toString() : null;
      if (!target || originOf(target) !== originOf(url) || hops >= MAX_REDIRECTS) {
        throw new NetworkError(
          'Refusing to follow a redirect that leaves the base URL origin (credentials would be forwarded)',
          pathOf(url),
          method
        );
      }
      currentUrl = target;
      if (response.status === 303) {
        currentInit = { ...currentInit, method: 'GET', body: undefined };
      }
    }
  } catch (error) {
    if (error instanceof TenxGraphError) throw error;
    const name = (error as { name?: string } | null)?.name;
    if (name === 'AbortError') {
      if (context.signal?.aborted) throw error;
      throw new RequestTimeoutError(context.timeout, pathOf(url), method, error);
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new NetworkError(`Network request failed: ${detail}`, pathOf(url), method, error);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    unlink();
  }
}
