import { ResponseMetadata } from './metadata.js';
import { createErrorFromResponse } from '../errors.js';
import {
  buildHeaders,
  getRequestCredentials,
  RequestContext,
  fetchWithTimeout,
} from '../request.js';

export interface GraphToolsContext extends RequestContext {}

export type ToolSource = 'local' | 'mcp' | 'remote';

export interface GraphTool {
  name: string;
  description: string;
  source: ToolSource;
  /** JSON Schema of the tool parameters (OpenAI function-calling shape). */
  parameters: Record<string, any>;
}

export interface GraphToolNode {
  node_name: string;
  tool_count: number;
  tools: GraphTool[];
}

export interface GraphToolsData {
  node_count: number;
  tool_count: number;
  nodes: GraphToolNode[];
}

export interface GraphToolsResponse {
  data: GraphToolsData;
  metadata: ResponseMetadata;
}

/**
 * Fetch the tools exposed by every ToolNode in the graph, grouped by node.
 * Each tool is tagged with its source (local / mcp / remote).
 */
export async function graphTools(context: GraphToolsContext): Promise<GraphToolsResponse> {
  try {
    if (context.debug) {
      console.debug('TenxGraphClient: Fetching graph tools from', context.baseUrl);
    }

    const response = await fetchWithTimeout(context, `${context.baseUrl}/v1/graph/tools`, {
      method: 'GET',
      headers: buildHeaders(context as RequestContext, {
        'Content-Type': 'application/json',
        accept: 'application/json',
      }),
      ...getRequestCredentials(context as RequestContext),
    });

    if (!response.ok) {
      console.warn(`TenxGraphClient: Graph tools fetch failed with HTTP ${response.status}`);
      const error = await createErrorFromResponse(
        response,
        'Graph tools fetch failed',
        '/v1/graph/tools',
        'GET'
      );
      throw error;
    }

    const data: GraphToolsResponse = await response.json();

    if (context.debug) {
      console.info('TenxGraphClient: Graph tools fetch successful', data);
    }

    return data;
  } catch (error) {
    if (context.debug) {
      console.debug('TenxGraphClient: Graph tools fetch failed:', error);
    }

    console.error('TenxGraphClient: Graph tools fetch failed:', error);
    throw error;
  }
}
