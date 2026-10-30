import { Message, RemoteToolCallBlock, ToolResultBlock } from './message.js';

// TOOL HANDLER
export interface ToolHandler {
  (args: any): Promise<any>;
}

/**
 * JSON Schema describing a tool's arguments.
 *
 * `properties` and `required` are optional, matching JSON Schema itself: a tool
 * whose arguments are all optional needs neither, and a tool that takes no
 * arguments can be declared as `{ type: 'object' }`. Additional JSON Schema
 * keywords (`additionalProperties`, `$defs`, ...) are passed through untouched.
 */
export interface ToolParameter {
  type: string;
  properties?: Record<string, any>;
  required?: string[];
  [key: string]: unknown;
}

/**
 * Fill in the JSON Schema defaults a tool declaration may leave out, so the
 * wire format sent to the server is always a complete object schema.
 */
export function normalizeToolParameters(parameters?: ToolParameter): ToolParameter {
  const source: Partial<ToolParameter> = parameters ?? {};
  const { type, properties, required, ...rest } = source;

  return {
    ...rest,
    type: type ?? 'object',
    properties: properties ?? {},
    required: required ?? [],
  };
}

export interface Tool {
  type: string;
  function: {
    name: string;
    description: string;
    parameters: ToolParameter;
  };
}

// Tool Registration - what users provide when registering tools
export interface ToolRegistration {
  node?: string;
  name: string;
  description?: string;
  parameters?: ToolParameter;
  handler: ToolHandler;
  /**
   * Runs on the server-sent arguments before the handler (after the declared `parameters`
   * check). Throw, or return `false`, to reject the call: the model receives a failed tool
   * result and the handler is not run.
   */
  validate?: (args: any) => boolean | void | Promise<boolean | void>;
  /** Reject calls whose JSON-serialised arguments exceed this many bytes. Default 1 MiB. */
  maxArgsBytes?: number;
}

/** Default cap on serialised tool-call arguments. */
export const DEFAULT_MAX_TOOL_ARGS_BYTES = 1024 * 1024;

/** Check `args` against the top level of a declared JSON Schema; returns an error message or null. */
export function checkToolArguments(args: unknown, parameters?: ToolParameter): string | null {
  if (!parameters) return null;
  if (args === null || typeof args !== 'object' || Array.isArray(args)) {
    return 'arguments must be an object';
  }
  const record = args as Record<string, unknown>;
  for (const key of parameters.required ?? []) {
    if (!(key in record)) return `missing required argument '${key}'`;
  }
  const properties = parameters.properties ?? {};
  if (parameters.additionalProperties === false) {
    for (const key of Object.keys(record)) {
      if (!(key in properties)) return `unexpected argument '${key}'`;
    }
  }
  for (const [key, schema] of Object.entries(properties)) {
    const value = record[key];
    const expected = (schema as { type?: unknown } | null)?.type;
    if (value === undefined || typeof expected !== 'string') continue;
    const ok =
      expected === 'string'
        ? typeof value === 'string'
        : expected === 'number'
          ? typeof value === 'number'
          : expected === 'integer'
            ? Number.isInteger(value)
            : expected === 'boolean'
              ? typeof value === 'boolean'
              : expected === 'array'
                ? Array.isArray(value)
                : expected === 'object'
                  ? value !== null && typeof value === 'object' && !Array.isArray(value)
                  : true;
    if (!ok) return `argument '${key}' must be of type ${expected}`;
  }
  return null;
}

// Internal tool definition (extends handler)
export interface ToolDefinition extends ToolHandler {
  name: string;
  description?: string;
  parameters?: ToolParameter;
  node?: string;
  validate?: ToolRegistration['validate'];
  maxArgsBytes?: number;
}

export class ToolExecutor {
  private tools: Map<string, ToolDefinition>;
  private toolsByNode: Map<string, Map<string, ToolDefinition>>;

  constructor(tools: ToolDefinition[] = []) {
    this.tools = new Map<string, ToolDefinition>();
    this.toolsByNode = new Map<string, Map<string, ToolDefinition>>();

    for (const func of tools) {
      this.tools.set(func.name, func);

      // Also organize by node if specified
      if (func.node) {
        if (!this.toolsByNode.has(func.node)) {
          this.toolsByNode.set(func.node, new Map());
        }
        this.toolsByNode.get(func.node)!.set(func.name, func);
      }
    }
  }

  /**
   * Register a new tool
   */
  registerTool(registration: ToolRegistration): void {
    // Create a proper ToolDefinition by wrapping the handler
    const toolDef: ToolDefinition = async (args: any) => {
      return registration.handler(args);
    };

    // Use Object.defineProperty to add properties to the function
    Object.defineProperty(toolDef, 'name', {
      value: registration.name,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(toolDef, 'description', {
      value: registration.description,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(toolDef, 'parameters', {
      value: registration.parameters,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(toolDef, 'validate', {
      value: registration.validate,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(toolDef, 'maxArgsBytes', {
      value: registration.maxArgsBytes,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(toolDef, 'node', {
      value: registration.node,
      writable: true,
      configurable: true,
    });

    this.tools.set(registration.name, toolDef);

    // Organize by node
    if (registration.node) {
      if (!this.toolsByNode.has(registration.node)) {
        this.toolsByNode.set(registration.node, new Map());
      }
      this.toolsByNode.get(registration.node)!.set(registration.name, toolDef);
    }
  }

  /**
   * Get tools for a specific node
   */
  getToolsForNode(node: string): ToolDefinition[] {
    const nodeTools = this.toolsByNode.get(node);
    return nodeTools ? Array.from(nodeTools.values()) : [];
  }

  /**
   * Get all tools in OpenAI-compatible format
   */
  all_tools(): Tool[] {
    const openaiTools: Tool[] = [];

    for (const [name, func] of this.tools) {
      const tool: Tool = {
        type: 'function',
        function: {
          name: name,
          description: func.description || `Execute ${name}`,
          parameters: normalizeToolParameters(func.parameters),
        },
      };
      openaiTools.push(tool);
    }

    return openaiTools;
  }

  /**
   * Extract and execute all tool calls from the response
   * Returns an array of tool result messages
   */
  async executeToolCalls(messages: Message[]): Promise<Message[]> {
    const toolCalls: RemoteToolCallBlock[] = [];

    // Extract all remote_tool_call blocks from messages
    for (const msg of messages) {
      if (msg.content) {
        for (const block of msg.content) {
          if (block.type === 'remote_tool_call') {
            toolCalls.push(block as RemoteToolCallBlock);
          }
        }
      }
    }

    const results: Message[] = [];

    const seenCallIds = new Set<string>();
    const failed = (callId: string, error: string): Message =>
      Message.tool_message([
        new ToolResultBlock({
          call_id: callId,
          output: { error },
          status: 'failed',
          is_error: true,
        }),
      ]);

    // Execute each tool call
    for (const call of toolCalls) {
      const toolName = call.name;

      if (call.id && seenCallIds.has(call.id)) {
        results.push(failed(call.id, `Duplicate tool call id '${call.id}' rejected`));
        continue;
      }
      if (call.id) seenCallIds.add(call.id);

      if (this.tools.has(toolName)) {
        const tool = this.tools.get(toolName)!;

        try {
          const maxBytes = tool.maxArgsBytes ?? DEFAULT_MAX_TOOL_ARGS_BYTES;
          const size = JSON.stringify(call.args ?? null)?.length ?? 0;
          if (size > maxBytes) {
            results.push(failed(call.id, `Arguments for '${toolName}' exceed ${maxBytes} bytes`));
            continue;
          }
          const invalid = checkToolArguments(call.args ?? {}, tool.parameters);
          if (invalid) {
            results.push(failed(call.id, `Invalid arguments for '${toolName}': ${invalid}`));
            continue;
          }
          if (tool.validate && (await tool.validate(call.args)) === false) {
            results.push(failed(call.id, `Arguments for '${toolName}' were rejected`));
            continue;
          }

          // Execute the tool
          const result = await tool(call.args);

          // Create a tool result message
          const toolResultBlock = new ToolResultBlock({
            call_id: call.id,
            output: result,
            status: 'completed',
            is_error: false,
          });

          results.push(Message.tool_message([toolResultBlock]));
        } catch (error) {
          // Handle errors
          const errorMessage = error instanceof Error ? error.message : String(error);

          const toolResultBlock = new ToolResultBlock({
            call_id: call.id,
            output: { error: errorMessage },
            status: 'failed',
            is_error: true,
          });

          results.push(Message.tool_message([toolResultBlock]));
        }
      } else {
        // Tool not found error
        const toolResultBlock = new ToolResultBlock({
          call_id: call.id,
          output: { error: `Tool '${toolName}' not found` },
          status: 'failed',
          is_error: true,
        });

        results.push(Message.tool_message([toolResultBlock]));
      }
    }

    return results;
  }
}
