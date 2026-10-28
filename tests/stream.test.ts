import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TenxGraphClient, Message, StreamChunk } from '../src/index';

describe('Stream API', () => {
  let client: TenxGraphClient;

  beforeEach(() => {
    client = new TenxGraphClient({
      baseUrl: 'http://localhost:8000',
      timeout: 5000,
      debug: false,
    });
  });

  describe('stream method', () => {
    it('should return an async generator', () => {
      const messages = [Message.text_message('Hello', 'user')];
      const stream = client.stream(messages);

      expect(stream).toBeDefined();
      expect(typeof stream[Symbol.asyncIterator]).toBe('function');
    });

    it('should accept optional configuration', () => {
      const messages = [Message.text_message('Hello', 'user')];
      const stream = client.stream(messages, {
        initial_state: { test: 'value' },
        config: { key: 'value' },
        recursion_limit: 10,
        response_granularity: 'low',
      });

      expect(stream).toBeDefined();
    });

    it('should yield chunks from stream', async () => {
      // Mock fetch to return a streaming response
      global.fetch = vi.fn().mockImplementation(() => {
        const encoder = new TextEncoder();
        const chunks = [
          JSON.stringify({
            event: 'message',
            message: {
              message_id: '1',
              role: 'assistant',
              content: [{ type: 'text', text: 'Hello!' }],
            },
            thread_id: 'test-thread',
            metadata: {},
          }) + '\n',
          JSON.stringify({
            event: 'updates',
            state: { context: [] },
            thread_id: 'test-thread',
            metadata: {},
          }) + '\n',
        ];

        const stream = new ReadableStream({
          start(controller) {
            chunks.forEach((chunk) => {
              controller.enqueue(encoder.encode(chunk));
            });
            controller.close();
          },
        });

        return Promise.resolve({
          ok: true,
          body: stream,
          text: () => Promise.resolve(''),
        } as Response);
      });

      const messages = [Message.text_message('Hello', 'user')];
      const stream = client.stream(messages);
      const chunks: StreamChunk[] = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].event).toBe('message');
    });

    it('should handle tool execution loop', async () => {
      let callCount = 0;

      // Mock fetch to return different responses
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        const encoder = new TextEncoder();

        let chunks: string[];
        if (callCount === 1) {
          // First call: return message with tool call
          chunks = [
            JSON.stringify({
              event: 'message',
              message: {
                message_id: '1',
                role: 'assistant',
                content: [
                  {
                    type: 'remote_tool_call',
                    name: 'test_tool',
                    arguments: { arg: 'value' },
                  },
                ],
              },
            }) + '\n',
          ];
        } else {
          // Second call: return final message (no tool calls)
          chunks = [
            JSON.stringify({
              event: 'message',
              message: {
                message_id: '2',
                role: 'assistant',
                content: [{ type: 'text', text: 'Done!' }],
              },
            }) + '\n',
          ];
        }

        const stream = new ReadableStream({
          start(controller) {
            chunks.forEach((chunk) => {
              controller.enqueue(encoder.encode(chunk));
            });
            controller.close();
          },
        });

        return Promise.resolve({
          ok: true,
          body: stream,
        } as Response);
      });

      // Register a tool
      client.registerTool({
        node: 'test_node',
        name: 'test_tool',
        description: 'Test tool',
        parameters: { type: 'object', properties: {}, required: [] },
        handler: async () => ({ result: 'success' }),
      });

      const messages = [Message.text_message('Test', 'user')];
      const stream = client.stream(messages, {
        recursion_limit: 5,
      });

      const chunks: StreamChunk[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      // Should have made 2 calls (initial + after tool execution)
      expect(callCount).toBe(2);
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should respect recursion limit', async () => {
      let callCount = 0;

      // Mock fetch to always return tool calls
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        const encoder = new TextEncoder();

        const chunks = [
          JSON.stringify({
            event: 'message',
            message: {
              message_id: String(callCount),
              role: 'assistant',
              content: [
                {
                  type: 'remote_tool_call',
                  name: 'test_tool',
                  arguments: {},
                },
              ],
            },
          }) + '\n',
        ];

        const stream = new ReadableStream({
          start(controller) {
            chunks.forEach((chunk) => {
              controller.enqueue(encoder.encode(chunk));
            });
            controller.close();
          },
        });

        return Promise.resolve({
          ok: true,
          body: stream,
        } as Response);
      });

      // Register a tool
      client.registerTool({
        node: 'test_node',
        name: 'test_tool',
        description: 'Test tool',
        parameters: { type: 'object', properties: {}, required: [] },
        handler: async () => ({ result: 'success' }),
      });

      const messages = [Message.text_message('Test', 'user')];
      const recursionLimit = 3;
      const stream = client.stream(messages, {
        recursion_limit: recursionLimit,
      });

      const chunks: StreamChunk[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      // Should have stopped at recursion limit
      expect(callCount).toBe(recursionLimit);
    });

    it('should handle stream errors', async () => {
      // Mock fetch to return error
      global.fetch = vi.fn().mockImplementation(() => {
        return Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Internal Server Error'),
        } as Response);
      });

      const messages = [Message.text_message('Test', 'user')];
      const stream = client.stream(messages);

      await expect(async () => {
        for await (const _chunk of stream) {
          // Should not reach here
        }
      }).rejects.toThrow();
    });

    it('should handle timeout', async () => {
      // Mock fetch to respect the abort signal
      global.fetch = vi.fn().mockImplementation((url, options) => {
        return new Promise((resolve, reject) => {
          // Listen for abort signal
          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }

          // Never resolve - just wait for abort
          // The timeout will trigger the abort signal
        });
      });

      const clientWithShortTimeout = new TenxGraphClient({
        baseUrl: 'http://localhost:8000',
        timeout: 100, // 100ms timeout
        debug: false,
      });

      const messages = [Message.text_message('Test', 'user')];
      const stream = clientWithShortTimeout.stream(messages);

      await expect(async () => {
        for await (const _chunk of stream) {
          // Should not reach here
        }
      }).rejects.toThrow('timeout');
    }, 10000);

    it('should yield chunks for multiple iterations', async () => {
      let callCount = 0;

      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        const encoder = new TextEncoder();

        let chunks: string[];
        if (callCount === 1) {
          // First iteration: message with tool call
          chunks = [
            JSON.stringify({
              event: 'message',
              message: {
                message_id: '1',
                role: 'assistant',
                content: [
                  {
                    type: 'remote_tool_call',
                    name: 'test_tool',
                    arguments: {},
                  },
                ],
              },
            }) + '\n',
            JSON.stringify({
              event: 'updates',
              state: {},
            }) + '\n',
          ];
        } else {
          // Second iteration: final message
          chunks = [
            JSON.stringify({
              event: 'message',
              message: {
                message_id: '2',
                role: 'assistant',
                content: [{ type: 'text', text: 'Complete' }],
              },
            }) + '\n',
            JSON.stringify({
              event: 'updates',
              state: {},
            }) + '\n',
          ];
        }

        const stream = new ReadableStream({
          start(controller) {
            chunks.forEach((chunk) => {
              controller.enqueue(encoder.encode(chunk));
            });
            controller.close();
          },
        });

        return Promise.resolve({
          ok: true,
          body: stream,
        } as Response);
      });

      client.registerTool({
        node: 'test_node',
        name: 'test_tool',
        description: 'Test tool',
        parameters: { type: 'object', properties: {}, required: [] },
        handler: async () => ({ result: 'ok' }),
      });

      const messages = [Message.text_message('Test', 'user')];
      const stream = client.stream(messages);
      const chunks: StreamChunk[] = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      // Should have chunks from both iterations
      expect(chunks.length).toBe(4); // 2 chunks per iteration
      expect(callCount).toBe(2);
    });
  });

  describe('thread id handling in the tool loop', () => {
    const run = async (config?: Record<string, any>) => {
      let callCount = 0;
      const bodies: any[] = [];
      global.fetch = vi.fn().mockImplementation((_url: string, init: any) => {
        callCount++;
        bodies.push(JSON.parse(init.body));
        const encoder = new TextEncoder();
        const chunk =
          callCount === 1
            ? {
                event: 'message',
                thread_id: 'server-thread-1',
                message: {
                  message_id: '1',
                  role: 'assistant',
                  content: [{ type: 'remote_tool_call', name: 'test_tool', arguments: {} }],
                },
              }
            : {
                event: 'message',
                thread_id: 'server-thread-1',
                message: {
                  message_id: '2',
                  role: 'assistant',
                  content: [{ type: 'text', text: 'Done!' }],
                },
              };
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(JSON.stringify(chunk) + '\n'));
            controller.close();
          },
        });
        return Promise.resolve({ ok: true, body: stream } as Response);
      });

      client.registerTool({
        node: 'test_node',
        name: 'test_tool',
        description: 'Test tool',
        parameters: { type: 'object', properties: {}, required: [] },
        handler: async () => ({ result: 'success' }),
      });

      const messages = [Message.text_message('Test', 'user')];
      for await (const _chunk of client.stream(messages, config ? { config } : undefined)) {
        // drain
      }
      return { callCount, bodies };
    };

    it('should reuse a server-assigned thread_id on tool result requests', async () => {
      const { callCount, bodies } = await run();

      expect(callCount).toBe(2);
      expect(bodies[0].config?.thread_id).toBeUndefined();
      expect(bodies[1].config.thread_id).toBe('server-thread-1');
    });

    it('should keep a caller-supplied thread_id and not mutate the caller config', async () => {
      const callerConfig = { thread_id: 'caller-thread' };
      const { bodies } = await run(callerConfig);

      expect(bodies[1].config.thread_id).toBe('caller-thread');
      expect(callerConfig).toEqual({ thread_id: 'caller-thread' });
    });
  });
});
