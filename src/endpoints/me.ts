import { ResponseMetadata } from './metadata.js';
import { createErrorFromResponse } from '../errors.js';
import {
  buildHeaders,
  getRequestCredentials,
  RequestContext,
  fetchWithTimeout,
} from '../request.js';

export interface MeContext extends RequestContext {}

export type MeReach = 'own' | 'tenant' | 'all';

/** Returned when the server runs with auth off. A UI can show everything. */
export interface MeAuthOff {
  auth: 'off';
}

/** The authenticated caller. `permissions` is `['*']` for an unrestricted identity. */
export interface MeIdentity {
  user_id: string;
  tenant: Record<string, string>;
  roles: string[];
  permissions: string[];
  reach: MeReach;
}

/** Either the caller's identity or `{ auth: 'off' }`. Test with `'auth' in data`. */
export type MeData = MeIdentity | MeAuthOff;

export interface MeResponse {
  data: MeData;
  metadata: ResponseMetadata;
}

export function isAuthOff(data: MeData): data is MeAuthOff {
  return 'auth' in data && data.auth === 'off';
}

export async function me(context: MeContext): Promise<MeResponse> {
  try {
    if (context.debug) {
      console.debug('TenxGraphClient: Fetching caller identity');
    }

    const response = await fetchWithTimeout(context, `${context.baseUrl}/v1/me`, {
      method: 'GET',
      headers: buildHeaders(context as RequestContext, {
        'Content-Type': 'application/json',
      }),
      ...getRequestCredentials(context as RequestContext),
    });

    if (!response.ok) {
      throw await createErrorFromResponse(response, 'Me request failed', '/v1/me', 'GET');
    }

    const data: MeResponse = await response.json();

    if (context.debug) {
      console.info('TenxGraphClient: Me successful', data);
    }

    return data;
  } catch (error) {
    if (context.debug) {
      console.debug('TenxGraphClient: Me failed:', error);
    }
    throw error;
  }
}
