import { ResponseMetadata } from './metadata.js';
import { createErrorFromResponse } from '../errors.js';
import {
  buildHeaders,
  getRequestCredentials,
  RequestContext,
  fetchWithTimeout,
} from '../request.js';

export interface GraphContext extends RequestContext {}

export interface GraphNode {
  id: string;
  name: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
}

/** Live (realtime) init options the server honors. */
export interface GraphRealtimeOptions {
  /** Init-frame keys applied from the client (subset of voice, modalities, vad, system_prompt). */
  client_overrides: string[];
  /** Accepted values for the init `model`; empty means the client cannot choose. */
  models: string[];
  model_selectable: boolean;
  /** The client may narrow (never widen) the agent's tool tags. */
  tools_tags: boolean;
}

export interface GraphInfo {
  node_count: number;
  edge_count: number;
  checkpointer: boolean;
  checkpointer_type: string | null;
  publisher: boolean;
  store: boolean;
  interrupt_before: string[] | null;
  interrupt_after: string[] | null;
  context_type: string | null;
  id_generator: string | null;
  id_type: string | null;
  state_type: string | null;
  state_fields: string[] | null;
  /** Live options the server honors; null when the graph is not a realtime agent. */
  realtime_options?: GraphRealtimeOptions | null;
}

export interface GraphData {
  info: GraphInfo;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphResponse {
  data: GraphData;
  metadata: ResponseMetadata;
}

export async function graph(context: GraphContext): Promise<GraphResponse> {
  try {
    if (context.debug) {
      console.debug('TenxGraphClient: Fetching graph from', context.baseUrl);
    }

    const response = await fetchWithTimeout(context, `${context.baseUrl}/v1/graph`, {
      method: 'GET',
      headers: buildHeaders(context as RequestContext, {
        'Content-Type': 'application/json',
        accept: 'application/json',
      }),
      ...getRequestCredentials(context as RequestContext),
    });

    if (!response.ok) {
      console.warn(`TenxGraphClient: Graph fetch failed with HTTP ${response.status}`);
      const error = await createErrorFromResponse(
        response,
        'Graph fetch failed',
        '/v1/graph',
        'GET'
      );
      throw error;
    }

    const data: GraphResponse = await response.json();

    if (context.debug) {
      console.info('TenxGraphClient: Graph fetch successful', data);
    }

    return data;
  } catch (error) {
    if (context.debug) {
      console.debug('TenxGraphClient: Graph fetch failed:', error);
    }

    console.error('TenxGraphClient: Graph fetch failed:', error);
    throw error;
  }
}
