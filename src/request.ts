import type { WebSocketImpl } from './ws.js';

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

export interface RequestContext {
  baseUrl: string;
  authToken?: string | null;
  auth?: TenxGraphAuth | null;
  headers?: HeadersInit;
  credentials?: RequestCredentials;
  timeout: number;
  debug: boolean;
  webSocketImpl?: WebSocketImpl;
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
