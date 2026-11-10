import { describe, it, expect } from 'vitest';
import { ToolExecutor, ToolDefinition, ToolRegistration } from '../src/tools';
import { Message, RemoteToolCallBlock, ToolResultBlock } from '../src/message';

// Helper function to create ToolDefinition
function createToolDef(
  handler: (args: any) => Promise<any>,
  name: string,
  options?: { description?: string; parameters?: any; node?: string }
): ToolDefinition {
  const toolDef = handler as ToolDefinition;
  Object.defineProperty(toolDef, 'name', { value: name, writable: true, configurable: true });
  if (options?.description) {
    Object.defineProperty(toolDef, 'description', {
      value: options.description,
      writable: true,
      configurable: true,
    });
  }
  if (options?.parameters) {
    Object.defineProperty(toolDef, 'parameters', {
      value: options.parameters,
      writable: true,
      configurable: true,
    });
  }
  if (options?.node) {
    Object.defineProperty(toolDef, 'node', {
      value: options.node,
      writable: true,
      configurable: true,
    });
  }
  return toolDef;
}

describe('ToolExecutor Unit Tests', () => {
  describe('constructor', () => {
    it('should create empty ToolExecutor', () => {
      const executor = new ToolExecutor();
      const tools = executor.all_tools();
      expect(tools).toEqual([]);
    });

    it('should create ToolExecutor with tools', () => {
      const weatherTool = createToolDef(
        async (args: any) => `Weather in ${args.location}`,
        'get_weather',
        {
          description: 'Get weather for a location',
          parameters: {
            type: 'object',
            properties: { location: { type: 'string' } },
            required: ['location'],
          },
        }
      );

      const executor = new ToolExecutor([weatherTool]);
      const tools = executor.all_tools();

      expect(tools).toHaveLength(1);
      expect(tools[0].function.name).toBe('get_weather');
    });

    it('should organize tools by node', () => {
      const tool1 = createToolDef(async (_args: any) => 'result1', 'tool1', {
        node: 'node_a',
        parameters: { type: 'object', properties: {}, required: [] },
      });

      const tool2 = createToolDef(async (_args: any) => 'result2', 'tool2', {
        node: 'node_a',
        parameters: { type: 'object', properties: {}, required: [] },
      });

      const tool3 = createToolDef(async (_args: any) => 'result3', 'tool3', {
        node: 'node_b',
        parameters: { type: 'object', properties: {}, required: [] },
      });

      const executor = new ToolExecutor([tool1, tool2, tool3]);

      const nodeATools = executor.getToolsForNode('node_a');
      const nodeBTools = executor.getToolsForNode('node_b');

      expect(nodeATools).toHaveLength(2);
      expect(nodeBTools).toHaveLength(1);
    });
  });

  describe('registerTool', () => {
    it('should register a new tool', () => {
      const executor = new ToolExecutor();

      const registration: ToolRegistration = {
        node: 'test_node',
        name: 'calculate_sum',
        description: 'Add two numbers',
        parameters: {
          type: 'object',
          properties: {
            a: { type: 'number' },
            b: { type: 'number' },
          },
          required: ['a', 'b'],
        },
        handler: async ({ a, b }) => a + b,
      };

      executor.registerTool(registration);

      const tools = executor.all_tools();
      expect(tools).toHaveLength(1);
      expect(tools[0].function.name).toBe('calculate_sum');
      expect(tools[0].function.description).toBe('Add two numbers');
    });

    it('should register tool with minimal properties', () => {
      const executor = new ToolExecutor();

      const registration: ToolRegistration = {
        node: 'test_node',
        name: 'simple_tool',
        handler: async () => 'result',
      };

      executor.registerTool(registration);

      const tools = executor.all_tools();
      expect(tools).toHaveLength(1);
      expect(tools[0].function.name).toBe('simple_tool');
    });

    it('should allow registering multiple tools', () => {
      const executor = new ToolExecutor();

      executor.registerTool({
        node: 'node1',
        name: 'tool1',
        handler: async () => 'result1',
      });

      executor.registerTool({
        node: 'node1',
        name: 'tool2',
        handler: async () => 'result2',
      });

      const tools = executor.all_tools();
      expect(tools).toHaveLength(2);
    });

    it('should organize registered tools by node', () => {
      const executor = new ToolExecutor();

      executor.registerTool({
        node: 'processing',
        name: 'process_data',
        handler: async () => 'processed',
      });

      const nodeTools = executor.getToolsForNode('processing');
      expect(nodeTools).toHaveLength(1);
      expect(nodeTools[0].name).toBe('process_data');
    });
  });

  describe('getToolsForNode', () => {
    it('should return empty array for non-existent node', () => {
      const executor = new ToolExecutor();
      const tools = executor.getToolsForNode('non_existent');
      expect(tools).toEqual([]);
    });

    it('should return tools for specific node', () => {
      const tool1 = createToolDef(async () => 'result1', 'tool1', {
        node: 'node_a',
        parameters: { type: 'object', properties: {}, required: [] },
      });

      const tool2 = createToolDef(async () => 'result2', 'tool2', {
        node: 'node_b',
        parameters: { type: 'object', properties: {}, required: [] },
      });

      const executor = new ToolExecutor([tool1, tool2]);

      const nodeATools = executor.getToolsForNode('node_a');
      expect(nodeATools).toHaveLength(1);
      expect(nodeATools[0].name).toBe('tool1');
    });

    it('should not return tools without node assignment', () => {
      const tool = createToolDef(async () => 'result', 'floating_tool', {
        parameters: { type: 'object', properties: {}, required: [] },
      });

      const executor = new ToolExecutor([tool]);
      const nodeTools = executor.getToolsForNode('any_node');
      expect(nodeTools).toEqual([]);
    });
  });

  describe('all_tools', () => {
    it('should return empty array when no tools registered', () => {
      const executor = new ToolExecutor();
      expect(executor.all_tools()).toEqual([]);
    });

    it('should return tools in OpenAI format', () => {
      const tool = createToolDef(async (args: any) => `Result: ${args.input}`, 'process_input', {
        description: 'Process user input',
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string', description: 'User input' },
          },
          required: ['input'],
        },
      });

      const executor = new ToolExecutor([tool]);
      const tools = executor.all_tools();

      expect(tools).toHaveLength(1);
      expect(tools[0]).toEqual({
        type: 'function',
        function: {
          name: 'process_input',
          description: 'Process user input',
          parameters: {
            type: 'object',
            properties: {
              input: { type: 'string', description: 'User input' },
            },
            required: ['input'],
          },
        },
      });
    });

    it('should generate default description for tools without one', () => {
      const tool = createToolDef(async () => 'result', 'my_tool', {
        parameters: { type: 'object', properties: {}, required: [] },
      });

      const executor = new ToolExecutor([tool]);
      const tools = executor.all_tools();

      expect(tools[0].function.description).toBe('Execute my_tool');
    });

    it('should provide default parameters if not specified', () => {
      const tool = createToolDef(async () => 'result', 'simple_tool');

      const executor = new ToolExecutor([tool]);
      const tools = executor.all_tools();

      expect(tools[0].function.parameters).toEqual({
        type: 'object',
        properties: {},
        required: [],
      });
    });
  });

  describe('executeToolCalls', () => {
    it('should return empty array when no tool calls in messages', async () => {
      const executor = new ToolExecutor();
      const messages = [Message.text_message('Hello')];

      const results = await executor.executeToolCalls(messages);
      expect(results).toEqual([]);
    });

    it('should execute tool call successfully', async () => {
      const tool = createToolDef(
        async (args: any) => `Weather in ${args.location}: Sunny, 72°F`,
        'get_weather',
        { parameters: { type: 'object', properties: {}, required: [] } }
      );

      const executor = new ToolExecutor([tool]);

      const toolCall = new RemoteToolCallBlock('call_123', 'get_weather', { location: 'NYC' });
      const message = new Message('assistant', [toolCall]);

      const results = await executor.executeToolCalls([message]);

      expect(results).toHaveLength(1);
      expect(results[0].role).toBe('tool');
      expect(results[0].content[0].type).toBe('tool_result');

      const resultBlock = results[0].content[0] as ToolResultBlock;
      expect(resultBlock.call_id).toBe('call_123');
      expect(resultBlock.name).toBe('get_weather');
      expect(resultBlock.output).toBe('Weather in NYC: Sunny, 72°F');
      expect(resultBlock.status).toBe('completed');
      expect(resultBlock.is_error).toBe(false);
    });

    it('should handle multiple tool calls', async () => {
      const weatherTool = createToolDef(
        async (args: any) => `Weather: ${args.location}`,
        'get_weather',
        { parameters: { type: 'object', properties: {}, required: [] } }
      );

      const timeTool = createToolDef(async (args: any) => `Time: ${args.timezone}`, 'get_time', {
        parameters: { type: 'object', properties: {}, required: [] },
      });

      const executor = new ToolExecutor([weatherTool, timeTool]);

      const call1 = new RemoteToolCallBlock('call_1', 'get_weather', { location: 'NYC' });
      const call2 = new RemoteToolCallBlock('call_2', 'get_time', { timezone: 'EST' });
      const message = new Message('assistant', [call1, call2]);

      const results = await executor.executeToolCalls([message]);

      expect(results).toHaveLength(2);
      expect((results[0].content[0] as ToolResultBlock).output).toBe('Weather: NYC');
      expect((results[1].content[0] as ToolResultBlock).output).toBe('Time: EST');
    });

    it('should handle tool execution error', async () => {
      const tool = createToolDef(
        async () => {
          throw new Error('Tool execution failed');
        },
        'failing_tool',
        { parameters: { type: 'object', properties: {}, required: [] } }
      );

      const executor = new ToolExecutor([tool]);

      const toolCall = new RemoteToolCallBlock('call_456', 'failing_tool', {});
      const message = new Message('assistant', [toolCall]);

      const results = await executor.executeToolCalls([message]);

      expect(results).toHaveLength(1);
      const resultBlock = results[0].content[0] as ToolResultBlock;
      expect(resultBlock.status).toBe('failed');
      expect(resultBlock.is_error).toBe(true);
      expect(resultBlock.output.error).toBe('Tool execution failed');
      expect(resultBlock.name).toBe('failing_tool');
    });

    it('should handle non-Error exceptions', async () => {
      const tool = createToolDef(
        async () => {
          throw 'String error';
        },
        'string_error_tool',
        { parameters: { type: 'object', properties: {}, required: [] } }
      );

      const executor = new ToolExecutor([tool]);

      const toolCall = new RemoteToolCallBlock('call_789', 'string_error_tool', {});
      const message = new Message('assistant', [toolCall]);

      const results = await executor.executeToolCalls([message]);

      expect(results).toHaveLength(1);
      const resultBlock = results[0].content[0] as ToolResultBlock;
      expect(resultBlock.output.error).toBe('String error');
    });

    it('should handle tool not found error', async () => {
      const executor = new ToolExecutor();

      const toolCall = new RemoteToolCallBlock('call_999', 'non_existent_tool', {});
      const message = new Message('assistant', [toolCall]);

      const results = await executor.executeToolCalls([message]);

      expect(results).toHaveLength(1);
      const resultBlock = results[0].content[0] as ToolResultBlock;
      expect(resultBlock.status).toBe('failed');
      expect(resultBlock.is_error).toBe(true);
      expect(resultBlock.output.error).toBe("Tool 'non_existent_tool' not found");
    });

    it('should extract tool calls from multiple messages', async () => {
      const tool = createToolDef(async (args: any) => `Processed: ${args.value}`, 'process', {
        parameters: { type: 'object', properties: {}, required: [] },
      });

      const executor = new ToolExecutor([tool]);

      const call1 = new RemoteToolCallBlock('call_1', 'process', { value: 'A' });
      const call2 = new RemoteToolCallBlock('call_2', 'process', { value: 'B' });

      const messages = [
        new Message('assistant', [call1]),
        Message.text_message('Some text'),
        new Message('assistant', [call2]),
      ];

      const results = await executor.executeToolCalls(messages);

      expect(results).toHaveLength(2);
      expect((results[0].content[0] as ToolResultBlock).output).toBe('Processed: A');
      expect((results[1].content[0] as ToolResultBlock).output).toBe('Processed: B');
    });

    it('should handle complex tool arguments', async () => {
      const tool = createToolDef(
        async (args: any) => {
          return {
            sum: args.numbers.reduce((a: number, b: number) => a + b, 0),
            count: args.numbers.length,
          };
        },
        'calculate',
        { parameters: { type: 'object', properties: {}, required: [] } }
      );

      const executor = new ToolExecutor([tool]);

      const toolCall = new RemoteToolCallBlock('call_complex', 'calculate', {
        numbers: [1, 2, 3, 4, 5],
      });
      const message = new Message('assistant', [toolCall]);

      const results = await executor.executeToolCalls([message]);

      const resultBlock = results[0].content[0] as ToolResultBlock;
      expect(resultBlock.output).toEqual({ sum: 15, count: 5 });
    });

    it('should handle async tool execution', async () => {
      const tool = createToolDef(
        async (args: any) => {
          return new Promise((resolve) => {
            setTimeout(() => resolve(`Delayed: ${args.msg}`), 10);
          });
        },
        'delayed_tool',
        { parameters: { type: 'object', properties: {}, required: [] } }
      );

      const executor = new ToolExecutor([tool]);

      const toolCall = new RemoteToolCallBlock('call_async', 'delayed_tool', { msg: 'test' });
      const message = new Message('assistant', [toolCall]);

      const results = await executor.executeToolCalls([message]);

      const resultBlock = results[0].content[0] as ToolResultBlock;
      expect(resultBlock.output).toBe('Delayed: test');
    });
  });
});
