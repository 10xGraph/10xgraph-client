/**
 * Error handling for 10xGraph API
 * Provides structured error types for all HTTP status codes
 */

// Error response structure from API
export interface ErrorDetail {
  loc?: string[];
  msg?: string;
  type?: string;
}

export interface ApiErrorResponse {
  metadata: {
    message: string;
    request_id: string;
    timestamp: string;
  };
  error: {
    code: string;
    message: string;
    details: ErrorDetail[];
    /** Present on 429 replies. */
    retry_after_seconds?: number;
  };
}

/**
 * Base error class for all 10xGraph API errors
 */
export class TenxGraphError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly requestId: string;
  public readonly timestamp: string;
  public readonly details: ErrorDetail[];
  public readonly context?: Record<string, any>;
  public endpoint?: string;
  public method?: string;
  public readonly recoverySuggestion?: string;
  /** Underlying error (fetch rejection, socket error) when there is one. */
  public cause?: unknown;
  /** Response headers of the failed HTTP reply, lowercased names. Absent for transport errors. */
  public responseHeaders?: Record<string, string>;
  /** Parsed JSON body (or raw text) of the failed HTTP reply, before any normalisation. */
  public responseBody?: unknown;

  constructor(
    message: string,
    statusCode: number,
    errorCode: string,
    requestId: string,
    timestamp: string,
    details: ErrorDetail[] = [],
    context?: Record<string, any>,
    endpoint?: string,
    method?: string,
    recoverySuggestion?: string
  ) {
    super(message);
    this.name = 'TenxGraphError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.requestId = requestId;
    this.timestamp = timestamp;
    this.details = details;
    this.context = context;
    this.endpoint = endpoint;
    this.method = method;
    this.recoverySuggestion = recoverySuggestion;

    // Maintains proper stack trace for where our error was thrown (only available on V8).
    // Typed structurally so the build does not depend on @types/node.
    const captureStackTrace = (
      Error as ErrorConstructor & {
        captureStackTrace?: (target: object, ctor?: unknown) => void;
      }
    ).captureStackTrace;
    if (captureStackTrace) {
      captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Get a user-friendly error message with recovery suggestion
   */
  getUserMessage(): string {
    if (this.recoverySuggestion) {
      return `${this.message}\n\nSuggestion: ${this.recoverySuggestion}`;
    }
    return this.message;
  }

  /**
   * Get full error details for debugging
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      errorCode: this.errorCode,
      requestId: this.requestId,
      timestamp: this.timestamp,
      details: this.details,
      context: this.context,
      endpoint: this.endpoint,
      method: this.method,
      recoverySuggestion: this.recoverySuggestion,
      stack: this.stack,
    };
  }
}

/**
 * 400 Bad Request Error
 * Thrown when the request is malformed or contains invalid data
 */
export class BadRequestError extends TenxGraphError {
  constructor(message: string, requestId: string, timestamp: string, details: ErrorDetail[] = []) {
    super(message, 400, 'BAD_REQUEST', requestId, timestamp, details);
    this.name = 'BadRequestError';
  }
}

/**
 * 401 Unauthorized Error
 * Thrown when authentication credentials are missing or invalid
 */
export class AuthenticationError extends TenxGraphError {
  constructor(message: string, requestId: string, timestamp: string, details: ErrorDetail[] = []) {
    super(message, 401, 'AUTHENTICATION_FAILED', requestId, timestamp, details);
    this.name = 'AuthenticationError';
  }
}

/**
 * 403 Forbidden Error
 * Thrown when the user doesn't have permission to access the resource
 */
export class PermissionError extends TenxGraphError {
  constructor(message: string, requestId: string, timestamp: string, details: ErrorDetail[] = []) {
    super(message, 403, 'PERMISSION_ERROR', requestId, timestamp, details);
    this.name = 'PermissionError';
  }
}

/**
 * 404 Not Found Error
 * Thrown when the requested resource doesn't exist
 */
export class NotFoundError extends TenxGraphError {
  constructor(message: string, requestId: string, timestamp: string, details: ErrorDetail[] = []) {
    super(message, 404, 'RESOURCE_NOT_FOUND', requestId, timestamp, details);
    this.name = 'NotFoundError';
  }
}

/**
 * 409 Conflict Error
 * Thrown when the thread is busy with another run, or when a resume's
 * `interrupt_id` does not match the open interrupt. Never retried automatically.
 */
export class ConflictError extends TenxGraphError {
  constructor(message: string, requestId: string, timestamp: string, details: ErrorDetail[] = []) {
    super(message, 409, 'CONFLICT', requestId, timestamp, details);
    this.name = 'ConflictError';
  }
}

/**
 * 422 Validation Error
 * Thrown when the request data fails validation
 */
export class ValidationError extends TenxGraphError {
  constructor(message: string, requestId: string, timestamp: string, details: ErrorDetail[] = []) {
    super(message, 422, 'VALIDATION_ERROR', requestId, timestamp, details);
    this.name = 'ValidationError';
  }
}

/**
 * 500 Server Error
 * Thrown when the server encounters an internal error
 */
export class ServerError extends TenxGraphError {
  constructor(
    message: string,
    requestId: string,
    timestamp: string,
    errorCode: string = 'INTERNAL_SERVER_ERROR',
    details: ErrorDetail[] = [],
    statusCode: number = 500
  ) {
    super(message, statusCode, errorCode, requestId, timestamp, details);
    this.name = 'ServerError';
  }
}

/**
 * Graph Error
 * Thrown when there's an error in graph execution
 */
export class GraphError extends TenxGraphError {
  constructor(
    message: string,
    requestId: string,
    timestamp: string,
    details: ErrorDetail[] = [],
    context?: Record<string, any>
  ) {
    super(
      message,
      500,
      'GRAPH_ERROR',
      requestId,
      timestamp,
      details,
      context,
      undefined,
      undefined,
      'Check your graph configuration and ensure all nodes are properly connected.'
    );
    this.name = 'GraphError';
  }
}

/**
 * Node Error
 * Thrown when there's an error executing a specific node
 */
export class NodeError extends TenxGraphError {
  public readonly nodeName?: string;

  constructor(
    message: string,
    requestId: string,
    timestamp: string,
    details: ErrorDetail[] = [],
    context?: Record<string, any>,
    nodeName?: string
  ) {
    super(
      message,
      500,
      'NODE_ERROR',
      requestId,
      timestamp,
      details,
      context,
      undefined,
      undefined,
      'Review the node implementation and ensure all required inputs are provided.'
    );
    this.name = 'NodeError';
    this.nodeName = nodeName;
  }
}

/**
 * Graph Recursion Error
 * Thrown when graph execution exceeds the recursion limit
 */
export class GraphRecursionError extends TenxGraphError {
  public readonly recursionLimit?: number;

  constructor(
    message: string,
    requestId: string,
    timestamp: string,
    details: ErrorDetail[] = [],
    context?: Record<string, any>,
    recursionLimit?: number
  ) {
    super(
      message,
      500,
      'GRAPH_RECURSION_ERROR',
      requestId,
      timestamp,
      details,
      context,
      undefined,
      undefined,
      'Consider increasing the recursion_limit parameter or check for infinite loops in your graph.'
    );
    this.name = 'GraphRecursionError';
    this.recursionLimit = recursionLimit;
  }
}

/**
 * Storage Error
 * Thrown when there's an error accessing storage
 */
export class StorageError extends TenxGraphError {
  constructor(
    message: string,
    requestId: string,
    timestamp: string,
    details: ErrorDetail[] = [],
    context?: Record<string, any>
  ) {
    super(
      message,
      500,
      'STORAGE_ERROR',
      requestId,
      timestamp,
      details,
      context,
      undefined,
      undefined,
      'Check your storage configuration and ensure the storage backend is accessible.'
    );
    this.name = 'StorageError';
  }
}

/**
 * Transient Storage Error
 * Thrown when there's a temporary storage issue (503 Service Unavailable)
 */
export class TransientStorageError extends TenxGraphError {
  constructor(
    message: string,
    requestId: string,
    timestamp: string,
    details: ErrorDetail[] = [],
    context?: Record<string, any>
  ) {
    super(
      message,
      503,
      'TRANSIENT_STORAGE_ERROR',
      requestId,
      timestamp,
      details,
      context,
      undefined,
      undefined,
      'This is a temporary issue. Please retry your request after a short delay.'
    );
    this.name = 'TransientStorageError';
  }
}

/**
 * Metrics Error
 * Thrown when there's an error collecting or reporting metrics
 */
export class MetricsError extends TenxGraphError {
  constructor(
    message: string,
    requestId: string,
    timestamp: string,
    details: ErrorDetail[] = [],
    context?: Record<string, any>
  ) {
    super(
      message,
      500,
      'METRICS_ERROR',
      requestId,
      timestamp,
      details,
      context,
      undefined,
      undefined,
      "Check your metrics configuration. This error typically doesn't affect core functionality."
    );
    this.name = 'MetricsError';
  }
}

/**
 * Schema Version Error
 * Thrown when there's a version mismatch in data schemas
 */
export class SchemaVersionError extends TenxGraphError {
  public readonly expectedVersion?: string;
  public readonly actualVersion?: string;

  constructor(
    message: string,
    requestId: string,
    timestamp: string,
    details: ErrorDetail[] = [],
    context?: Record<string, any>,
    expectedVersion?: string,
    actualVersion?: string
  ) {
    super(
      message,
      422,
      'SCHEMA_VERSION_ERROR',
      requestId,
      timestamp,
      details,
      context,
      undefined,
      undefined,
      'Update your client to match the server schema version or contact support.'
    );
    this.name = 'SchemaVersionError';
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

/**
 * Serialization Error
 * Thrown when there's an error serializing or deserializing data
 */
export class SerializationError extends TenxGraphError {
  constructor(
    message: string,
    requestId: string,
    timestamp: string,
    details: ErrorDetail[] = [],
    context?: Record<string, any>
  ) {
    super(
      message,
      500,
      'SERIALIZATION_ERROR',
      requestId,
      timestamp,
      details,
      context,
      undefined,
      undefined,
      'Ensure your data format is compatible with the API schema.'
    );
    this.name = 'SerializationError';
  }
}

/**
 * 429 Too Many Requests
 * Carries the server's retry hint in seconds (Retry-After header, else the body's
 * `retry_after_seconds`), or undefined when the server sent none.
 */
export class RateLimitError extends TenxGraphError {
  public readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    requestId: string,
    timestamp: string,
    details: ErrorDetail[] = [],
    retryAfterSeconds?: number
  ) {
    super(
      message,
      429,
      'RATE_LIMIT_EXCEEDED',
      requestId,
      timestamp,
      details,
      undefined,
      undefined,
      undefined,
      'Wait for the retry-after period before sending the request again.'
    );
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Request Timeout Error
 * Thrown client-side when a request exceeds the configured `timeout`. statusCode is 0.
 */
export class RequestTimeoutError extends TenxGraphError {
  public readonly timeoutMs: number;

  constructor(timeoutMs: number, endpoint?: string, method?: string, cause?: unknown) {
    super(
      `Request timeout after ${timeoutMs}ms`,
      0,
      'REQUEST_TIMEOUT',
      'unknown',
      new Date().toISOString(),
      [],
      undefined,
      endpoint,
      method,
      'Increase the client timeout or check that the server is reachable and not overloaded.'
    );
    this.name = 'RequestTimeoutError';
    this.timeoutMs = timeoutMs;
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * Network Error
 * Thrown when the request never got an HTTP reply (DNS failure, connection refused, offline,
 * CORS block). `cause` holds the underlying fetch error. statusCode is 0.
 */
export class NetworkError extends TenxGraphError {
  constructor(message: string, endpoint?: string, method?: string, cause?: unknown) {
    super(
      message,
      0,
      'NETWORK_ERROR',
      'unknown',
      new Date().toISOString(),
      [],
      undefined,
      endpoint,
      method,
      'Check that the server is running, the base URL is correct and the network is reachable.'
    );
    this.name = 'NetworkError';
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * WebSocket Error
 * Thrown for WebSocket failures: connection errors, unexpected close, handshake rejection.
 * `closeCode` is the close frame code when the failure was a close.
 */
export class WebSocketError extends TenxGraphError {
  public readonly closeCode?: number;

  constructor(message: string, closeCode?: number, endpoint?: string, cause?: unknown) {
    super(
      message,
      0,
      'WEBSOCKET_ERROR',
      'unknown',
      new Date().toISOString(),
      [],
      undefined,
      endpoint,
      'WS'
    );
    this.name = 'WebSocketError';
    this.closeCode = closeCode;
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * Stream Error
 * Thrown when an HTTP or WebSocket run stream fails after it started: an error chunk from the
 * server, a malformed chunk, or a stream that ended before completion.
 */
export class StreamError extends TenxGraphError {
  constructor(
    message: string,
    errorCode: string = 'STREAM_ERROR',
    requestId: string = 'unknown',
    endpoint?: string,
    method?: string,
    cause?: unknown
  ) {
    super(
      message,
      0,
      errorCode,
      requestId,
      new Date().toISOString(),
      [],
      undefined,
      endpoint,
      method
    );
    this.name = 'StreamError';
    if (cause !== undefined) this.cause = cause;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Normalise any JSON error body into the envelope shape. Handles the 10xGraph envelope,
 * `{"error": "state_conflict", "detail": "..."}` (409), `{"detail": "..."}` and FastAPI's
 * `{"detail": [{loc, msg, type}]}`. Returns null for a body that carries no usable error.
 */
function normalizeErrorBody(body: unknown): ApiErrorResponse | null {
  const record = asRecord(body);
  if (!record) return null;

  const meta = asRecord(record.metadata) ?? {};
  const metadata = {
    message: typeof meta.message === 'string' ? meta.message : '',
    request_id: typeof meta.request_id === 'string' ? meta.request_id : '',
    timestamp: typeof meta.timestamp === 'string' ? meta.timestamp : '',
  };

  const err = asRecord(record.error);
  if (err) {
    return {
      metadata,
      error: {
        code: typeof err.code === 'string' ? err.code : '',
        message: typeof err.message === 'string' ? err.message : '',
        details: Array.isArray(err.details) ? (err.details as ErrorDetail[]) : [],
        ...(typeof err.retry_after_seconds === 'number'
          ? { retry_after_seconds: err.retry_after_seconds }
          : {}),
      },
    };
  }

  if (typeof record.error === 'string') {
    const detail = typeof record.detail === 'string' ? record.detail : record.error;
    return { metadata, error: { code: record.error, message: detail, details: [] } };
  }

  if (typeof record.detail === 'string') {
    return { metadata, error: { code: '', message: record.detail, details: [] } };
  }

  if (Array.isArray(record.detail)) {
    const details = record.detail.filter((d) => asRecord(d) !== null) as ErrorDetail[];
    return {
      metadata,
      error: { code: '', message: details[0]?.msg || 'Validation error', details },
    };
  }

  return null;
}

async function readErrorBody(
  response: Response
): Promise<{ parsed: ApiErrorResponse | null; raw: unknown }> {
  try {
    const contentType = response.headers?.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const raw: unknown = await response.json();
      return { parsed: normalizeErrorBody(raw), raw };
    }
    return { parsed: null, raw: undefined };
  } catch {
    // If we can't parse the error response, return null
    return { parsed: null, raw: undefined };
  }
}

/**
 * Parse error response from API
 */
export async function parseErrorResponse(response: Response): Promise<ApiErrorResponse | null> {
  return (await readErrorBody(response)).parsed;
}

function headersToRecord(response: Response): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    response.headers?.forEach((value, name) => {
      out[name.toLowerCase()] = value;
    });
  } catch {
    // ignore unreadable headers
  }
  return out;
}

/** Parse a Retry-After header (delta-seconds or HTTP date) into whole seconds. */
function parseRetryAfter(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, Math.ceil((date - Date.now()) / 1000));
  return undefined;
}

function codeMatches(code: string, prefixes: string[]): boolean {
  const upper = code.toUpperCase();
  return prefixes.some((prefix) => upper.startsWith(prefix));
}

/**
 * Create appropriate error instance based on HTTP status code and error code
 */
export async function createErrorFromResponse(
  response: Response,
  fallbackMessage?: string,
  endpoint?: string,
  method?: string
): Promise<TenxGraphError> {
  const { parsed: errorData, raw } = await readErrorBody(response);
  const headerRequestId = response.headers?.get('x-request-id') || '';

  const message =
    errorData?.error.message || fallbackMessage || `HTTP error! status: ${response.status}`;
  const requestId = errorData?.metadata.request_id || headerRequestId || 'unknown';
  const timestamp = errorData?.metadata.timestamp || new Date().toISOString();
  const details = errorData?.error.details || [];
  const errorCode = errorData?.error.code || '';

  const error = buildError(response.status, errorCode, message, requestId, timestamp, details, {
    retryAfter:
      parseRetryAfter(response.headers?.get('retry-after')) ?? errorData?.error.retry_after_seconds,
    endpoint,
    method,
  });
  error.endpoint = endpoint;
  error.method = method;
  error.responseHeaders = headersToRecord(response);
  if (raw !== undefined) error.responseBody = raw;
  return error;
}

function buildError(
  status: number,
  errorCode: string,
  message: string,
  requestId: string,
  timestamp: string,
  details: ErrorDetail[],
  extra: { retryAfter?: number; endpoint?: string; method?: string }
): TenxGraphError {
  // Core error codes first (they take priority over the HTTP status). The server sends
  // RECURSION_001, STORAGE_TRANSIENT_000, STORAGE_SCHEMA_000 and STORAGE_SERIALIZATION_000;
  // the older GRAPH_RECURSION / TRANSIENT_STORAGE / SCHEMA_VERSION / SERIALIZATION spellings
  // are still accepted. Specific storage codes must be tested before the STORAGE prefix.
  if (codeMatches(errorCode, ['RECURSION', 'GRAPH_RECURSION'])) {
    return new GraphRecursionError(message, requestId, timestamp, details);
  } else if (codeMatches(errorCode, ['GRAPH'])) {
    return new GraphError(message, requestId, timestamp, details);
  } else if (codeMatches(errorCode, ['NODE'])) {
    return new NodeError(message, requestId, timestamp, details);
  } else if (codeMatches(errorCode, ['STORAGE_TRANSIENT', 'TRANSIENT_STORAGE'])) {
    return new TransientStorageError(message, requestId, timestamp, details);
  } else if (codeMatches(errorCode, ['STORAGE_SCHEMA', 'SCHEMA_VERSION'])) {
    return new SchemaVersionError(message, requestId, timestamp, details);
  } else if (codeMatches(errorCode, ['STORAGE_SERIALIZATION', 'SERIALIZATION'])) {
    return new SerializationError(message, requestId, timestamp, details);
  } else if (codeMatches(errorCode, ['STORAGE'])) {
    return new StorageError(message, requestId, timestamp, details);
  } else if (codeMatches(errorCode, ['METRICS'])) {
    return new MetricsError(message, requestId, timestamp, details);
  }

  // VALIDATION_ERROR (and the older AGENTFLOW_VALIDATION_ERROR spelling) are validation errors
  if (errorCode === 'VALIDATION_ERROR' || errorCode === 'AGENTFLOW_VALIDATION_ERROR') {
    return new ValidationError(message, requestId, timestamp, details);
  }

  switch (status) {
    case 400:
      return new BadRequestError(message, requestId, timestamp, details);
    case 401:
      return new AuthenticationError(message, requestId, timestamp, details);
    case 403:
      return new PermissionError(message, requestId, timestamp, details);
    case 404:
      return new NotFoundError(message, requestId, timestamp, details);
    case 409:
      return new ConflictError(message, requestId, timestamp, details);
    case 422:
      return new ValidationError(message, requestId, timestamp, details);
    case 429:
      return new RateLimitError(message, requestId, timestamp, details, extra.retryAfter);
    case 500:
    case 502:
    case 503:
    case 504:
      return new ServerError(
        message,
        requestId,
        timestamp,
        errorCode || 'INTERNAL_SERVER_ERROR',
        details,
        status
      );
    default:
      return new TenxGraphError(
        message,
        status,
        errorCode || 'UNKNOWN_ERROR',
        requestId,
        timestamp,
        details,
        undefined,
        extra.endpoint,
        extra.method
      );
  }
}
