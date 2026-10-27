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
  public readonly endpoint?: string;
  public readonly method?: string;
  public readonly recoverySuggestion?: string;

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
 * Parse error response from API
 */
export async function parseErrorResponse(response: Response): Promise<ApiErrorResponse | null> {
  try {
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const body = (await response.json()) as ApiErrorResponse | { detail?: unknown };
      // FastAPI-style body such as {"detail": "thread is busy"} (no envelope)
      if (body && !('error' in body) && typeof (body as { detail?: unknown }).detail === 'string') {
        const detail = (body as { detail: string }).detail;
        return {
          metadata: { message: detail, request_id: 'unknown', timestamp: new Date().toISOString() },
          error: { code: '', message: detail, details: [] },
        };
      }
      return body as ApiErrorResponse;
    }
    return null;
  } catch {
    // If we can't parse the error response, return null
    return null;
  }
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
  const errorData = await parseErrorResponse(response);

  // If we successfully parsed the error response
  if (errorData) {
    const { metadata, error } = errorData;
    const message = error.message || fallbackMessage || `HTTP error ${response.status}`;
    const requestId = metadata.request_id || 'unknown';
    const timestamp = metadata.timestamp || new Date().toISOString();
    const details = error.details || [];
    const errorCode = error.code || '';

    // Try to match specific error types by error code first (takes priority)
    if (errorCode.startsWith('GRAPH_RECURSION')) {
      return new GraphRecursionError(message, requestId, timestamp, details);
    } else if (errorCode.startsWith('GRAPH')) {
      return new GraphError(message, requestId, timestamp, details);
    } else if (errorCode.startsWith('NODE')) {
      return new NodeError(message, requestId, timestamp, details);
    } else if (errorCode.startsWith('TRANSIENT_STORAGE')) {
      return new TransientStorageError(message, requestId, timestamp, details);
    } else if (errorCode.startsWith('STORAGE')) {
      return new StorageError(message, requestId, timestamp, details);
    } else if (errorCode.startsWith('METRICS')) {
      return new MetricsError(message, requestId, timestamp, details);
    } else if (errorCode.startsWith('SCHEMA_VERSION')) {
      return new SchemaVersionError(message, requestId, timestamp, details);
    } else if (errorCode.startsWith('SERIALIZATION')) {
      return new SerializationError(message, requestId, timestamp, details);
    }

    // Match by HTTP status code
    switch (response.status) {
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
          response.status
        );
      default:
        return new TenxGraphError(
          message,
          response.status,
          errorCode || 'UNKNOWN_ERROR',
          requestId,
          timestamp,
          details,
          undefined,
          endpoint,
          method
        );
    }
  }

  // Fallback if we couldn't parse the error response
  const message = fallbackMessage || `HTTP error! status: ${response.status}`;
  const timestamp = new Date().toISOString();

  switch (response.status) {
    case 400:
      return new BadRequestError(message, 'unknown', timestamp);
    case 401:
      return new AuthenticationError(message, 'unknown', timestamp);
    case 403:
      return new PermissionError(message, 'unknown', timestamp);
    case 404:
      return new NotFoundError(message, 'unknown', timestamp);
    case 409:
      return new ConflictError(message, 'unknown', timestamp);
    case 422:
      return new ValidationError(message, 'unknown', timestamp);
    case 500:
    case 502:
    case 503:
    case 504:
      return new ServerError(
        message,
        'unknown',
        timestamp,
        'INTERNAL_SERVER_ERROR',
        [],
        response.status
      );
    default:
      return new TenxGraphError(
        message,
        response.status,
        'UNKNOWN_ERROR',
        'unknown',
        timestamp,
        [],
        undefined,
        endpoint,
        method
      );
  }
}
