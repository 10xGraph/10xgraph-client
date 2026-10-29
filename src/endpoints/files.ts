/**
 * File upload and retrieval endpoints for multimodal messages.
 */

import { createErrorFromResponse } from '../errors.js';
import { buildHeaders, getRequestCredentials, RequestContext } from '../request.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface FileUploadContext extends RequestContext {}

export interface FileUploadResponse {
  data: {
    file_id: string;
    mime_type: string;
    size_bytes: number;
    filename: string;
    extracted_text: string | null;
    url: string;
    direct_url?: string | null;
    direct_url_expires_at?: number | null;
  };
  metadata?: {
    request_id: string;
    timestamp: string;
    message: string;
  };
}

export interface FileInfoResponse {
  data: {
    file_id: string;
    mime_type: string;
    size_bytes: number;
    filename?: string | null;
    extracted_text: string | null;
    direct_url?: string | null;
    direct_url_expires_at?: number | null;
  };
  metadata?: {
    request_id: string;
    timestamp: string;
    message: string;
  };
}

export interface FileAccessUrlResponse {
  data: {
    file_id: string;
    url: string;
    expires_at?: number | null;
    mime_type: string;
  };
  metadata?: {
    request_id: string;
    timestamp: string;
    message: string;
  };
}

export interface MultimodalConfigResponse {
  data: {
    media_storage_type: string;
    media_max_size_mb: number;
    document_handling: string;
  };
  metadata?: {
    request_id: string;
    timestamp: string;
    message: string;
  };
}

// ---------------------------------------------------------------------------
// Upload file
// ---------------------------------------------------------------------------
/**
 * Upload a file (image, audio, document) to the server.
 *
 * @param ctx - Connection context
 * @param file - A File, Blob, or { data: Blob; filename: string } object
 * @returns FileUploadResponse with file_id and metadata
 */
export async function uploadFile(
  ctx: FileUploadContext,
  file: File | Blob | { data: Blob; filename: string }
): Promise<FileUploadResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ctx.timeout);

  try {
    const formData = new FormData();

    // `File` only became a global in Node 20; this package supports Node 18, where a bare
    // `instanceof File` throws ReferenceError. Guard before touching the global.
    if (typeof File !== 'undefined' && file instanceof File) {
      formData.append('file', file, file.name);
    } else if ('data' in file && 'filename' in file) {
      formData.append('file', file.data, file.filename);
    } else {
      formData.append('file', file, 'upload');
    }

    const response = await fetch(`${ctx.baseUrl}/v1/files/upload`, {
      method: 'POST',
      headers: buildHeaders(ctx as RequestContext),
      body: formData,
      ...getRequestCredentials(ctx as RequestContext),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await createErrorFromResponse(
        response,
        'File upload failed',
        '/v1/files/upload',
        'POST'
      );
      throw error;
    }

    return (await response.json()) as FileUploadResponse;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Get file (binary download)
// ---------------------------------------------------------------------------
/**
 * Download a file by its file_id. Returns raw Blob.
 */
export async function getFile(ctx: FileUploadContext, fileId: string): Promise<Blob> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ctx.timeout);

  try {
    const response = await fetch(`${ctx.baseUrl}/v1/files/${encodeURIComponent(fileId)}`, {
      method: 'GET',
      headers: buildHeaders(ctx as RequestContext),
      ...getRequestCredentials(ctx as RequestContext),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await createErrorFromResponse(
        response,
        'File download failed',
        `/v1/files/${fileId}`,
        'GET'
      );
      throw error;
    }

    return await response.blob();
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// List files (GET /v1/files)
// ---------------------------------------------------------------------------
export interface ListFilesRequest {
  /** Page size (server default 50, maximum 200). */
  limit?: number;
  /** Number of files to skip. */
  offset?: number;
}

export interface FileListItem {
  file_id: string;
  filename: string | null;
  mime_type: string;
  size_bytes: number;
  url: string;
  /** Unix seconds, or null when the store records no timestamp. */
  created_at: number | null;
}

export interface ListFilesResponse {
  data: {
    files: FileListItem[];
    has_more: boolean;
    offset: number;
    limit: number;
  };
  metadata?: {
    request_id: string;
    timestamp: string;
    message: string;
  };
}

/**
 * List the caller's uploaded files. A store that cannot enumerate its files
 * (for example a cloud store) answers 501, which is thrown as a TenxGraphError.
 */
export async function listFiles(
  ctx: FileUploadContext,
  params?: ListFilesRequest
): Promise<ListFilesResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ctx.timeout);

  try {
    const query = new URLSearchParams();
    if (params?.limit !== undefined) query.append('limit', String(params.limit));
    if (params?.offset !== undefined) query.append('offset', String(params.offset));
    const qs = query.toString();

    const response = await fetch(`${ctx.baseUrl}/v1/files${qs ? `?${qs}` : ''}`, {
      method: 'GET',
      headers: buildHeaders(ctx as RequestContext),
      ...getRequestCredentials(ctx as RequestContext),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await createErrorFromResponse(
        response,
        'List files request failed',
        '/v1/files',
        'GET'
      );
      throw error;
    }

    return (await response.json()) as ListFilesResponse;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Get file info (metadata)
// ---------------------------------------------------------------------------
export async function getFileInfo(
  ctx: FileUploadContext,
  fileId: string
): Promise<FileInfoResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ctx.timeout);

  try {
    const response = await fetch(`${ctx.baseUrl}/v1/files/${encodeURIComponent(fileId)}/info`, {
      method: 'GET',
      headers: buildHeaders(ctx as RequestContext),
      ...getRequestCredentials(ctx as RequestContext),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await createErrorFromResponse(
        response,
        'File info request failed',
        `/v1/files/${fileId}/info`,
        'GET'
      );
      throw error;
    }

    return (await response.json()) as FileInfoResponse;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Get file access URL
// ---------------------------------------------------------------------------
export async function getFileAccessUrl(
  ctx: FileUploadContext,
  fileId: string
): Promise<FileAccessUrlResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ctx.timeout);

  try {
    const response = await fetch(`${ctx.baseUrl}/v1/files/${encodeURIComponent(fileId)}/url`, {
      method: 'GET',
      headers: buildHeaders(ctx as RequestContext),
      ...getRequestCredentials(ctx as RequestContext),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await createErrorFromResponse(
        response,
        'File access URL request failed',
        `/v1/files/${fileId}/url`,
        'GET'
      );
      throw error;
    }

    return (await response.json()) as FileAccessUrlResponse;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Get multimodal config
// ---------------------------------------------------------------------------
export async function getMultimodalConfig(
  ctx: FileUploadContext
): Promise<MultimodalConfigResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ctx.timeout);

  try {
    const response = await fetch(`${ctx.baseUrl}/v1/config/multimodal`, {
      method: 'GET',
      headers: buildHeaders(ctx as RequestContext, {
        accept: 'application/json',
      }),
      ...getRequestCredentials(ctx as RequestContext),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await createErrorFromResponse(
        response,
        'Multimodal config request failed',
        '/v1/config/multimodal',
        'GET'
      );
      throw error;
    }

    return (await response.json()) as MultimodalConfigResponse;
  } finally {
    clearTimeout(timeoutId);
  }
}
