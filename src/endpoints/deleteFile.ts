import { ResponseMetadata } from './metadata.js';
import { createErrorFromResponse } from '../errors.js';
import {
  buildHeaders,
  getRequestCredentials,
  RequestContext,
  fetchWithTimeout,
} from '../request.js';

export interface DeleteFileContext extends RequestContext {}

export interface DeleteFileData {
  file_id: string;
  deleted: boolean;
}

export interface DeleteFileResponse {
  data: DeleteFileData;
  metadata: ResponseMetadata;
}

export async function deleteFile(
  context: DeleteFileContext,
  fileId: string
): Promise<DeleteFileResponse> {
  try {
    if (context.debug) {
      console.debug('TenxGraphClient: Deleting file', `file: ${fileId}`);
    }

    const url = `${context.baseUrl}/v1/files/${encodeURIComponent(fileId)}`;

    const response = await fetchWithTimeout(context, url, {
      method: 'DELETE',
      headers: buildHeaders(context as RequestContext, {
        accept: 'application/json',
      }),
      ...getRequestCredentials(context as RequestContext),
    });

    if (!response.ok) {
      console.warn(`TenxGraphClient: Delete file failed with HTTP ${response.status}`);
      const error = await createErrorFromResponse(
        response,
        'Delete file failed',
        `/v1/files/${fileId}`,
        'DELETE'
      );
      throw error;
    }

    const data: DeleteFileResponse = await response.json();

    if (context.debug) {
      console.info('TenxGraphClient: File deleted successfully', data);
    }

    return data;
  } catch (error) {
    if (context.debug) {
      console.debug('TenxGraphClient: Delete file failed:', error);
    }
    throw error;
  }
}
