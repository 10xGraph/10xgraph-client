import { ToolHandler, ToolRegistration, ToolExecutor } from './tools.js';
import { Message } from './message.js';
import { ping, PingContext, PingResponse } from './endpoints/ping.js';
import { graph, GraphContext, GraphResponse } from './endpoints/graph.js';
import { graphTools, GraphToolsContext, GraphToolsResponse } from './endpoints/graphTools.js';
import {
  observability,
  ObservabilityContext,
  ObservabilityResponse,
} from './endpoints/observability.js';
import { stateSchema, StateSchemaContext, StateSchemaResponse } from './endpoints/stateSchema.js';
import { threadState, ThreadStateContext, ThreadStateResponse } from './endpoints/threadState.js';
import {
  updateThreadState,
  UpdateThreadStateContext,
  UpdateThreadStateRequest,
  UpdateThreadStateResponse,
} from './endpoints/updateThreadState.js';
import {
  clearThreadState,
  ClearThreadStateContext,
  ClearThreadStateResponse,
} from './endpoints/clearThreadState.js';
import {
  threadMessages,
  ThreadMessagesContext,
  ThreadMessagesRequest,
  ThreadMessagesResponse,
} from './endpoints/threadMessages.js';
import {
  addThreadMessages,
  AddThreadMessagesContext,
  AddThreadMessagesRequest,
  AddThreadMessagesResponse,
} from './endpoints/addThreadMessages.js';
import {
  threadMessage,
  ThreadMessageContext,
  ThreadMessageRequest,
  ThreadMessageResponse,
} from './endpoints/threadMessage.js';
import {
  threadDetails,
  ThreadDetailsContext,
  ThreadDetailsResponse,
} from './endpoints/threadDetails.js';
import {
  deleteThreadMessage,
  DeleteThreadMessageContext,
  DeleteThreadMessageRequest,
  DeleteThreadMessageResponse,
} from './endpoints/deleteThreadMessage.js';
import {
  updateThreadMessageFeedback,
  UpdateThreadMessageFeedbackContext,
  UpdateThreadMessageFeedbackRequest,
  UpdateThreadMessageFeedbackResponse,
} from './endpoints/updateThreadMessageFeedback.js';
import {
  deleteThread,
  DeleteThreadContext,
  DeleteThreadRequest,
  DeleteThreadResponse,
} from './endpoints/deleteThread.js';
import { threads, ThreadsContext, ThreadsRequest, ThreadsResponse } from './endpoints/threads.js';
import {
  invoke as invokeEndpoint,
  InvokeContext,
  InvokeRequest,
  InvokeResult,
  InvokeCallback,
} from './endpoints/invoke.js';
import {
  streamInvoke as streamInvokeEndpoint,
  StreamContext,
  StreamRequest,
  StreamChunk,
} from './endpoints/stream.js';
import { wsStreamInvoke, WsStreamContext } from './endpoints/wsStream.js';
import {
  RealtimeSession,
  RealtimeInit,
  RealtimeOptions,
  RealtimeContext,
} from './endpoints/realtime.js';
import type { WebSocketImpl } from './ws.js';
import {
  storeMemory as storeMemoryEndpoint,
  StoreMemoryContext,
  StoreMemoryRequest,
  StoreMemoryResponse,
} from './endpoints/storeMemory.js';
import {
  searchMemory as searchMemoryEndpoint,
  SearchMemoryContext,
  SearchMemoryRequest,
  SearchMemoryResponse,
} from './endpoints/searchMemory.js';
import {
  getMemory as getMemoryEndpoint,
  GetMemoryContext,
  GetMemoryRequest,
  GetMemoryResponse,
} from './endpoints/getMemory.js';
import {
  updateMemory as updateMemoryEndpoint,
  UpdateMemoryContext,
  UpdateMemoryRequest,
  UpdateMemoryResponse,
} from './endpoints/updateMemory.js';
import {
  deleteMemory as deleteMemoryEndpoint,
  DeleteMemoryContext,
  DeleteMemoryRequest,
  DeleteMemoryResponse,
} from './endpoints/deleteMemory.js';
import {
  listMemories as listMemoriesEndpoint,
  ListMemoriesContext,
  ListMemoriesRequest,
  ListMemoriesResponse,
} from './endpoints/listMemories.js';
import {
  forgetMemories as forgetMemoriesEndpoint,
  ForgetMemoriesContext,
  ForgetMemoriesRequest,
  ForgetMemoriesResponse,
} from './endpoints/forgetMemories.js';
import {
  stopGraph as stopGraphEndpoint,
  StopGraphContext,
  StopGraphRequest,
  StopGraphResponse,
} from './endpoints/stopGraph.js';
import {
  fixGraph as fixGraphEndpoint,
  FixGraphContext,
  FixGraphRequest,
  FixGraphResponse,
} from './endpoints/fixGraph.js';
import {
  uploadFile as uploadFileEndpoint,
  getFile as getFileEndpoint,
  getFileInfo as getFileInfoEndpoint,
  getFileAccessUrl as getFileAccessUrlEndpoint,
  getMultimodalConfig as getMultimodalConfigEndpoint,
  FileUploadContext,
  FileUploadResponse,
  FileAccessUrlResponse,
  FileInfoResponse,
  MultimodalConfigResponse,
} from './endpoints/files.js';
import {
  deleteFile as deleteFileEndpoint,
  DeleteFileContext,
  DeleteFileResponse,
} from './endpoints/deleteFile.js';
import { TenxGraphAuth, RequestContext } from './request.js';

export interface TenxGraphConfig {
  baseUrl: string;
  authToken?: string | null;
  auth?: TenxGraphAuth | null;
  headers?: HeadersInit;
  credentials?: RequestCredentials;
  timeout?: number; // default 5min
  debug?: boolean;
  webSocketImpl?: WebSocketImpl;
}

function isThreadsRequest(value?: string | ThreadsRequest): value is ThreadsRequest {
  return typeof value === 'object' && value !== null;
}

function normalizeThreadsRequest(
  value?: string | ThreadsRequest,
  offset?: number,
  limit?: number
): ThreadsRequest {
  if (isThreadsRequest(value)) {
    return {
      search: value.search,
      offset: value.offset,
      limit: value.limit,
    };
  }

  return {
    search: value,
    offset,
    limit,
  };
}

function isThreadMessagesRequest(
  value?: string | Omit<ThreadMessagesRequest, 'threadId'>
): value is Omit<ThreadMessagesRequest, 'threadId'> {
  return typeof value === 'object' && value !== null;
}

function normalizeThreadMessagesRequest(
  threadId: string | number,
  value?: string | Omit<ThreadMessagesRequest, 'threadId'>,
  offset?: number,
  limit?: number
): ThreadMessagesRequest {
  if (isThreadMessagesRequest(value)) {
    return {
      threadId,
      search: value.search,
      offset: value.offset,
      limit: value.limit,
    };
  }

  return {
    threadId,
    search: value,
    offset,
    limit,
  };
}

export class TenxGraphClient {
  private baseUrl: string;
  private authToken?: string | null;
  private auth?: TenxGraphAuth | null;
  private headers?: HeadersInit;
  private credentials?: RequestCredentials;
  private timeout: number;
  private debug: boolean;
  private webSocketImpl?: WebSocketImpl;
  private toolExecutor: ToolExecutor;

  constructor(config: TenxGraphConfig) {
    this.baseUrl = config.baseUrl;
    this.authToken = config.authToken;
    this.auth = config.auth;
    this.headers = config.headers;
    this.credentials = config.credentials;
    this.timeout = config.timeout || 300000; // 5 min
    this.debug = config.debug || false;
    this.webSocketImpl = config.webSocketImpl;
    this.toolExecutor = new ToolExecutor([]);
  }

  private createContext<T extends RequestContext>(): T {
    return {
      baseUrl: this.baseUrl,
      authToken: this.authToken,
      auth: this.auth,
      headers: this.headers,
      credentials: this.credentials,
      timeout: this.timeout,
      debug: this.debug,
      webSocketImpl: this.webSocketImpl,
    } as T;
  }

  /**
   * Register a tool for remote execution
   */
  registerTool(registration: ToolRegistration): void {
    this.toolExecutor.registerTool(registration);

    if (this.debug) {
      console.debug(`TenxGraphClient: Registered remote tool handler '${registration.name}'`);
    }
  }

  /**
   * Register only the client-side implementation of a remote tool.
   * The trusted schema must be declared in the server's 10xgraph.json.
   */
  registerToolHandler(name: string, handler: ToolHandler): void {
    this.registerTool({ name, handler });
  }

  /**
   * Ping the server to check connectivity
   */
  async ping(): Promise<PingResponse> {
    const context = this.createContext<PingContext>();

    return ping(context);
  }

  /**
   * Fetch the agent graph
   */
  async graph(): Promise<GraphResponse> {
    const context = this.createContext<GraphContext>();

    return graph(context);
  }

  /**
   * Fetch the tools exposed by the graph's tool nodes, grouped by node.
   * Each tool is tagged with its source (local / mcp / remote).
   */
  async graphTools(): Promise<GraphToolsResponse> {
    const context = this.createContext<GraphToolsContext>();

    return graphTools(context);
  }

  /**
   * Fetch the reconstructed observability trace (spans, events, cost) for a
   * thread. Returns the latest run by default, or a specific run when given.
   */
  async observability(threadId: string, runId?: string): Promise<ObservabilityResponse> {
    const context = this.createContext<ObservabilityContext>();

    return observability(context, threadId, runId);
  }

  /**
   * Stop a running graph execution for a specific thread
   * @param threadId - The ID of the thread to stop execution for
   * @param config - Optional configuration for the stop operation
   * @returns StopGraphResponse with the stop operation result
   */
  async stopGraph(threadId: string, config?: Record<string, any>): Promise<StopGraphResponse> {
    const context = this.createContext<StopGraphContext>();

    const request: StopGraphRequest = {
      thread_id: threadId,
      config,
    };

    return stopGraphEndpoint(context, request);
  }

  /**
   * Fix graph state by removing messages with empty tool calls
   * This is useful for cleaning up incomplete tool call messages that may have
   * failed or been interrupted during execution.
   *
   * @param threadId - The ID of the thread to fix state for
   * @param config - Optional configuration for the fix operation
   * @returns FixGraphResponse with the fix operation result including removed_count
   */
  async fixGraph(threadId: string, config?: Record<string, any>): Promise<FixGraphResponse> {
    const context = this.createContext<FixGraphContext>();

    const request: FixGraphRequest = {
      thread_id: threadId,
      config,
    };

    return fixGraphEndpoint(context, request);
  }

  /**
     * 

    /**
     * Fetch the state schema of the agent
     */
  async graphStateSchema(): Promise<StateSchemaResponse> {
    const context = this.createContext<StateSchemaContext>();

    return stateSchema(context);
  }

  /**
   * ***************** ALL THREAD APIS *****************
   */

  /**
   * Fetch the state of a specific thread
   * @param threadId - The ID of the thread to fetch state for
   * @returns ThreadStateResponse containing the thread's current state
   */
  async threadState(threadId: string | number): Promise<ThreadStateResponse> {
    const context = this.createContext<ThreadStateContext>();

    return threadState(context, threadId);
  }

  /**
   * Update the state of a specific thread (checkpoint)
   * @param threadId - The ID of the thread to update
   * @param config - Configuration map for the thread
   * @param state - New AgentState for the thread
   * @returns UpdateThreadStateResponse with the updated state
   */
  async updateThreadState(
    threadId: string | number,
    config: Record<string, any>,
    state: any // AgentState
  ): Promise<UpdateThreadStateResponse> {
    const context = this.createContext<UpdateThreadStateContext>();

    const request: UpdateThreadStateRequest = {
      config,
      state,
    };

    return updateThreadState(context, threadId, request);
  }

  /**
   * Clear the state of a specific thread (delete checkpoint)
   * @param threadId - The ID of the thread to clear state for
   * @returns ClearThreadStateResponse with the clear operation result
   */
  async clearThreadState(threadId: string | number): Promise<ClearThreadStateResponse> {
    const context = this.createContext<ClearThreadStateContext>();

    return clearThreadState(context, threadId);
  }

  /**
   * Fetch details for a specific thread
   * @param threadId - The ID of the thread to fetch
   * @returns ThreadDetailsResponse containing thread details
   */
  async threadDetails(threadId: string | number): Promise<ThreadDetailsResponse> {
    const context = this.createContext<ThreadDetailsContext>();

    return threadDetails(context, threadId);
  }

  /**
   * Fetch list of threads with optional search and pagination
   * @param search - Optional search term to filter threads
   * @param offset - Optional offset for pagination (default 0)
   * @param limit - Optional limit for pagination (default no limit)
   * @returns ThreadsResponse containing the list of threads and metadata
   */
  async threads(): Promise<ThreadsResponse>;
  async threads(request: ThreadsRequest): Promise<ThreadsResponse>;
  async threads(
    search?: string | ThreadsRequest,
    offset?: number,
    limit?: number
  ): Promise<ThreadsResponse> {
    const context = this.createContext<ThreadsContext>();
    const request = normalizeThreadsRequest(search, offset, limit);

    return threads(context, request);
  }

  /**
   * Fetch messages from a specific thread with optional search and pagination
   * @param threadId - The ID of the thread to fetch messages from
   * @param search - Optional search term to filter messages
   * @param offset - Optional offset for pagination (default 0)
   * @param limit - Optional limit for pagination (default no limit)
   * @returns ThreadMessagesResponse containing the messages and metadata
   */
  async threadMessages(
    threadId: string | number,
    request: Omit<ThreadMessagesRequest, 'threadId'>
  ): Promise<ThreadMessagesResponse>;
  async threadMessages(
    threadId: string | number,
    search?: string | Omit<ThreadMessagesRequest, 'threadId'>,
    offset?: number,
    limit?: number
  ): Promise<ThreadMessagesResponse> {
    const context = this.createContext<ThreadMessagesContext>();
    const request = normalizeThreadMessagesRequest(threadId, search, offset, limit);

    return threadMessages(context, request);
  }

  /**
   * Add messages to a specific thread checkpoint
   *
   * @deprecated Requires the `checkpointer:import` scope (admin only) in 10xgraph-api releases after 0.9.0.
   * Use `updateThreadMessageFeedback` to attach feedback to a message.
   *
   * @param threadId - The ID of the thread to add messages to
   * @param messages - Array of messages to add to the checkpoint
   * @param config - Configuration map for the checkpoint
   * @param metadata - Optional metadata for the checkpoint
   * @returns AddCheckpointMessagesResponse containing the operation result
   */
  async addThreadMessages(
    threadId: string | number,
    messages: Message[],
    config: Record<string, any> = {},
    metadata?: Record<string, any>
  ): Promise<AddThreadMessagesResponse> {
    const context = this.createContext<AddThreadMessagesContext>();

    const request: AddThreadMessagesRequest = {
      threadId,
      config,
      messages,
      metadata,
    };

    return addThreadMessages(context, request);
  }

  /**
   * Fetch a specific message from a thread by message ID
   * @param threadId - The ID of the thread
   * @param messageId - The ID of the message to fetch
   * @returns ThreadMessageResponse containing the message and metadata
   */
  async singleMessage(
    threadId: string | number,
    messageId: string
  ): Promise<ThreadMessageResponse> {
    const context = this.createContext<ThreadMessageContext>();

    const request: ThreadMessageRequest = {
      threadId,
      messageId,
    };

    return threadMessage(context, request);
  }

  /**
   * Delete a specific message from a thread
   * @param threadId - The ID of the thread
   * @param messageId - The ID of the message to delete
   * @param config - Optional configuration map to send with the request body
   * @returns DeleteThreadMessageResponse containing the deletion result
   */
  async deleteMessage(
    threadId: string | number,
    messageId: string,
    config?: Record<string, any>
  ): Promise<DeleteThreadMessageResponse> {
    const context = this.createContext<DeleteThreadMessageContext>();

    const request: DeleteThreadMessageRequest = {
      threadId,
      messageId,
      config,
    };

    return deleteThreadMessage(context, request);
  }

  /**
   * Replace the feedback attached to a message (`message.metadata.feedback`).
   * Nothing else on the message changes.
   * @param threadId - The ID of the thread
   * @param messageId - The ID of the message to attach feedback to
   * @param feedback - Any JSON object, at most 8192 serialized bytes and nesting depth 10
   * @returns UpdateThreadMessageFeedbackResponse containing the updated message
   */
  async updateThreadMessageFeedback(
    threadId: string | number,
    messageId: string,
    feedback: Record<string, any>
  ): Promise<UpdateThreadMessageFeedbackResponse> {
    const context = this.createContext<UpdateThreadMessageFeedbackContext>();

    const request: UpdateThreadMessageFeedbackRequest = {
      threadId,
      messageId,
      feedback,
    };

    return updateThreadMessageFeedback(context, request);
  }

  /**
   * Delete a specific thread
   * @param threadId - The ID of the thread to delete
   * @param config - Optional configuration map to send with the request body
   * @returns DeleteThreadResponse containing the deletion result
   */
  async deleteThread(
    threadId: string | number,
    config?: Record<string, any>
  ): Promise<DeleteThreadResponse> {
    const context = this.createContext<DeleteThreadContext>();

    const request: DeleteThreadRequest = {
      threadId,
      config,
    };

    return deleteThread(context, request);
  }

  /**
   * Invoke the agent graph with automatic tool execution loop
   * @param messages - Array of messages to send
   * @param options - Invoke options
   * @returns InvokeResult with all messages and intermediate steps
   */
  async invoke(
    messages: Message[],
    options?: {
      initial_state?: Record<string, any>;
      config?: Record<string, any>;
      recursion_limit?: number;
      on_busy?: 'wait' | 'cancel';
      resume?: unknown;
      interrupt_id?: string;
      response_granularity?: 'full' | 'partial' | 'low';
      onPartialResult?: InvokeCallback;
    }
  ): Promise<InvokeResult> {
    const context: InvokeContext = {
      ...this.createContext<InvokeContext>(),
      toolExecutor: this.toolExecutor,
    };

    // Prepare request
    const request: InvokeRequest = {
      messages: messages.map((msg) => this.serializeMessage(msg)),
      initial_state: options?.initial_state,
      config: options?.config,
      recursion_limit: options?.recursion_limit || 25,
      on_busy: options?.on_busy,
      resume: options?.resume,
      interrupt_id: options?.interrupt_id,
      response_granularity: options?.response_granularity || 'full',
    };

    // Call the invoke endpoint (which handles the recursion loop)
    return invokeEndpoint(context, request, options?.onPartialResult);
  }

  /**
   * Stream invoke to the agent graph
   * Returns an async iterable that yields stream chunks as they arrive
   *
   * @param messages - Array of messages to send
   * @param options - Stream options
   * @returns AsyncGenerator of StreamChunk objects
   *
   * @example
   * ```ts
   * const stream = client.streamInvoke([userMessage], {
   *   initial_state: {},
   *   response_granularity: 'low'
   * });
   *
   * for await (const chunk of stream) {
   *   if (chunk.event === 'message') {
   *     console.log('Message:', chunk.message?.content);
   *   } else if (chunk.event === 'updates') {
   *     console.log('State updated:', chunk.state);
   *   }
   * }
   * ```
   */
  stream(
    messages: Message[],
    options?: {
      initial_state?: Record<string, any>;
      config?: Record<string, any>;
      recursion_limit?: number;
      on_busy?: 'wait' | 'cancel';
      resume?: unknown;
      interrupt_id?: string;
      response_granularity?: 'full' | 'partial' | 'low';
    }
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const context: StreamContext = {
      ...this.createContext<StreamContext>(),
      toolExecutor: this.toolExecutor,
    };

    // Prepare request
    const request: StreamRequest = {
      messages: messages.map((msg) => this.serializeMessage(msg)),
      initial_state: options?.initial_state,
      config: options?.config,
      recursion_limit: options?.recursion_limit || 25,
      on_busy: options?.on_busy,
      resume: options?.resume,
      interrupt_id: options?.interrupt_id,
      response_granularity: options?.response_granularity || 'low',
    };

    // Return async generator from the stream endpoint
    return streamInvokeEndpoint(context, request);
  }

  /**
   * Stream invoke via a persistent WebSocket connection.
   *
   * Identical API to ``stream()`` — same message types, same chunk format,
   * same tool-execution loop — but uses a single WebSocket instead of one
   * HTTP request per tool-call iteration.  Switch from ``stream()`` to
   * ``wsStream()`` by changing one method name; everything else stays the
   * same.
   *
   * The WebSocket stays open for the full lifecycle of the call (fresh run +
   * any resume runs triggered by remote tool calls).  The server sends a
   * ``{ event:"updates", data:{ status:"done" } }`` chunk after each run so
   * the client knows when to send the next resume request.
   *
   * Auth: the bearer token is sent via the ``10xgraph-bearer`` WebSocket
   * subprotocol (browser-safe; never placed in the URL), with the Authorization
   * header also set on Node runtimes.
   *
   * @param messages - Array of messages to send
   * @param options - Same options as ``stream()``
   * @returns AsyncGenerator of StreamChunk objects
   *
   * @example
   * ```ts
   * const stream = client.wsStream([userMessage], {
   *   config: { thread_id: 'my-thread' },
   *   response_granularity: 'low',
   * });
   *
   * for await (const chunk of stream) {
   *   if (chunk.event === 'message') {
   *     console.log('Message:', chunk.message?.content);
   *   }
   * }
   * ```
   */
  wsStream(
    messages: Message[],
    options?: {
      initial_state?: Record<string, any>;
      config?: Record<string, any>;
      recursion_limit?: number;
      on_busy?: 'wait' | 'cancel';
      resume?: unknown;
      interrupt_id?: string;
      response_granularity?: 'full' | 'partial' | 'low';
    }
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const context: WsStreamContext = {
      ...this.createContext<WsStreamContext>(),
      toolExecutor: this.toolExecutor,
    };

    const request: StreamRequest = {
      messages: messages.map((msg) => this.serializeMessage(msg)),
      initial_state: options?.initial_state,
      config: options?.config,
      recursion_limit: options?.recursion_limit ?? 25,
      on_busy: options?.on_busy,
      resume: options?.resume,
      interrupt_id: options?.interrupt_id,
      response_granularity: options?.response_granularity ?? 'low',
    };

    return wsStreamInvoke(context, request);
  }

  /**
   * Open a realtime (audio-to-audio) session over ``/v1/graph/live``.
   *
   * Transport-only: send PCM16 input via ``session.sendAudio(...)`` and receive
   * PCM16 output via ``session.on('audio', ...)``. Mic capture and audio playback
   * are the caller's responsibility. The session auto-reconnects (with backoff)
   * on an unexpected drop and resumes the same ``thread_id``.
   *
   * @example
   * ```ts
   * const session = client.realtime({ model: 'gemini-2.5-flash-live' });
   * session.on('audio', (pcm) => speaker.write(pcm));
   * session.on('output_transcript', (e) => console.log(e.text));
   * await session.ready;
   * session.sendAudio(micChunk);
   * ```
   */
  realtime(init: RealtimeInit, options?: RealtimeOptions): RealtimeSession {
    const context = this.createContext<RealtimeContext>();
    return new RealtimeSession(context, init, options);
  }

  /**
   * Store a memory in the agent's memory system
   *
   * @param request - Memory storage request parameters
   * @returns Promise<StoreMemoryResponse> containing the memory_id
   *
   * @example
   * ```ts
   * const result = await client.storeMemory({
   *   content: "User prefers dark mode",
   *   memory_type: MemoryType.SEMANTIC,
   *   category: "preferences",
   *   metadata: { source: "user_settings" }
   * });
   * console.log('Memory stored with ID:', result.data.memory_id);
   * ```
   */
  async storeMemory(request: StoreMemoryRequest): Promise<StoreMemoryResponse> {
    const context = this.createContext<StoreMemoryContext>();

    return storeMemoryEndpoint(context, request);
  }

  /**
   * Search for memories in the agent's memory system
   *
   * @param request - Memory search request parameters
   * @returns Promise<SearchMemoryResponse> containing matching memories
   *
   * @example
   * ```ts
   * const results = await client.searchMemory({
   *   query: "dark mode preferences",
   *   memory_type: MemoryType.SEMANTIC,
   *   limit: 5,
   *   retrieval_strategy: RetrievalStrategy.SIMILARITY
   * });
   * results.data.results.forEach(result => {
   *   console.log('Memory:', result.content, 'Score:', result.score);
   * });
   * ```
   */
  async searchMemory(request: SearchMemoryRequest): Promise<SearchMemoryResponse> {
    const context = this.createContext<SearchMemoryContext>();

    return searchMemoryEndpoint(context, request);
  }

  /**
   * Get a specific memory by ID
   *
   * @param memoryId - The ID of the memory to retrieve
   * @param options - Optional config and options
   * @returns Promise<GetMemoryResponse> containing the memory details
   *
   * @example
   * ```ts
   * const memory = await client.getMemory('mem-12345', {
   *   config: { include_vector: true }
   * });
   * console.log('Memory:', memory.data.memory.content);
   * console.log('Score:', memory.data.memory.score);
   * ```
   */
  async getMemory(
    memoryId: string,
    options?: { config?: Record<string, any>; options?: Record<string, any> }
  ): Promise<GetMemoryResponse> {
    const context = this.createContext<GetMemoryContext>();

    const request: GetMemoryRequest = {
      memoryId,
      config: options?.config,
      options: options?.options,
    };

    return getMemoryEndpoint(context, request);
  }

  /**
   * Update an existing memory by ID
   *
   * @param memoryId - The ID of the memory to update
   * @param content - The updated content for the memory
   * @param options - Optional config, options, and metadata
   * @returns Promise<UpdateMemoryResponse> containing success status and updated data
   *
   * @example
   * ```ts
   * const result = await client.updateMemory('mem-12345', 'Updated content', {
   *   metadata: { tags: ['important', 'updated'] }
   * });
   * console.log('Update success:', result.data.success);
   * ```
   */
  async updateMemory(
    memoryId: string,
    content: string,
    options?: {
      config?: Record<string, any>;
      options?: Record<string, any>;
      metadata?: Record<string, any>;
    }
  ): Promise<UpdateMemoryResponse> {
    const context = this.createContext<UpdateMemoryContext>();

    const request: UpdateMemoryRequest = {
      memoryId,
      content,
      config: options?.config,
      options: options?.options,
      metadata: options?.metadata,
    };

    return updateMemoryEndpoint(context, request);
  }

  /**
   * Delete a memory by ID
   *
   * @param memoryId - The ID of the memory to delete
   * @param options - Optional config and options
   * @returns Promise<DeleteMemoryResponse> containing success status and deletion confirmation
   *
   * @example
   * ```ts
   * const result = await client.deleteMemory('mem-12345', {
   *   config: { soft_delete: true }
   * });
   * console.log('Delete success:', result.data.success);
   * console.log('Deleted:', result.data.data);
   * ```
   */
  async deleteMemory(
    memoryId: string,
    options?: { config?: Record<string, any>; options?: Record<string, any> }
  ): Promise<DeleteMemoryResponse> {
    const context = this.createContext<DeleteMemoryContext>();

    const request: DeleteMemoryRequest = {
      memoryId,
      config: options?.config,
      options: options?.options,
    };

    return deleteMemoryEndpoint(context, request);
  }

  /**
   * List all memories with optional pagination
   *
   * @param options - Optional config, options, and limit
   * @returns Promise<ListMemoriesResponse> containing array of memories
   *
   * @example
   * ```ts
   * const result = await client.listMemories({
   *   limit: 50,
   *   config: { include_vectors: false }
   * });
   * console.log('Found memories:', result.data.memories.length);
   * result.data.memories.forEach(memory => {
   *   console.log('Memory:', memory.content, 'Type:', memory.memory_type);
   * });
   * ```
   */
  async listMemories(options?: {
    config?: Record<string, any>;
    options?: Record<string, any>;
    limit?: number;
  }): Promise<ListMemoriesResponse> {
    const context = this.createContext<ListMemoriesContext>();

    const request: ListMemoriesRequest = {
      config: options?.config,
      options: options?.options,
      limit: options?.limit,
    };

    return listMemoriesEndpoint(context, request);
  }

  /**
   * Forget (delete) memories based on filters and criteria
   *
   * @param options - Optional config, options, memory type, category, and filters
   * @returns Promise<ForgetMemoriesResponse> containing success status
   *
   * @example
   * ```ts
   * // Forget all episodic memories in a category
   * const result = await client.forgetMemories({
   *   memory_type: MemoryType.EPISODIC,
   *   category: 'temporary',
   *   filters: { tag: 'delete-me' }
   * });
   * console.log('Forget success:', result.data.success);
   * ```
   */
  async forgetMemories(options?: {
    config?: Record<string, any>;
    options?: Record<string, any>;
    memory_type?: any;
    category?: string;
    filters?: Record<string, any>;
  }): Promise<ForgetMemoriesResponse> {
    const context = this.createContext<ForgetMemoriesContext>();

    const request: ForgetMemoriesRequest = {
      config: options?.config,
      options: options?.options,
      memory_type: options?.memory_type,
      category: options?.category,
      filters: options?.filters,
    };

    return forgetMemoriesEndpoint(context, request);
  }

  // ------------------------------------------------------------------
  // Files / Multimodal API
  // ------------------------------------------------------------------

  /**
   * Upload a file (image, audio, document) to the server.
   * Returns file metadata including file_id for use in multimodal messages.
   *
   * @param file - A File, Blob, or { data: Blob; filename: string } object
   * @returns FileUploadResponse with file_id and metadata
   *
   * @example
   * ```ts
   * const result = await client.uploadFile(file);
   * const msg = Message.withImage('Describe this', result.data.url);
   * ```
   */
  async uploadFile(
    file: File | Blob | { data: Blob; filename: string }
  ): Promise<FileUploadResponse> {
    const context = this.createContext<FileUploadContext>();
    return uploadFileEndpoint(context, file);
  }

  /**
   * Download a file by its file_id. Returns raw Blob.
   */
  async getFile(fileId: string): Promise<Blob> {
    const context = this.createContext<FileUploadContext>();
    return getFileEndpoint(context, fileId);
  }

  /**
   * Get metadata about a stored file.
   */
  async getFileInfo(fileId: string): Promise<FileInfoResponse> {
    const context = this.createContext<FileUploadContext>();
    return getFileInfoEndpoint(context, fileId);
  }

  /**
   * Get the best access URL for a stored file.
   * For cloud-backed media this will typically be a signed URL.
   * For local or memory-backed media this may fall back to the API file route.
   */
  async getFileAccessUrl(fileId: string): Promise<FileAccessUrlResponse> {
    const context = this.createContext<FileUploadContext>();
    return getFileAccessUrlEndpoint(context, fileId);
  }

  /**
   * Delete a stored file. Only the file's owner can delete it.
   * Requires the `files:delete` permission; the server returns 404 when the file
   * does not exist or belongs to someone else.
   *
   * @param fileId - The file_id returned by `uploadFile`
   * @returns DeleteFileResponse with `data.file_id` and `data.deleted`
   */
  async deleteFile(fileId: string): Promise<DeleteFileResponse> {
    const context = this.createContext<DeleteFileContext>();
    return deleteFileEndpoint(context, fileId);
  }

  /**
   * Get the current multimodal configuration from the server.
   */
  async getMultimodalConfig(): Promise<MultimodalConfigResponse> {
    const context = this.createContext<FileUploadContext>();
    return getMultimodalConfigEndpoint(context);
  }

  /**
   * Serialize a Message object for API transmission
   * Converts Message class instances to plain objects
   */
  private serializeMessage(message: Message): any {
    const serialized: any = {
      role: message.role,
      content: this.cleanContent(message.content),
    };

    // message_id: use "0" if not set (server will generate one)
    if (message.message_id !== null && message.message_id !== undefined) {
      serialized.message_id = String(message.message_id);
    } else {
      serialized.message_id = '0';
    }

    // Only include optional fields if they are explicitly set
    if (message.tools_calls) {
      serialized.tools_calls = message.tools_calls;
    }
    if (message.metadata && Object.keys(message.metadata).length > 0) {
      serialized.metadata = message.metadata;
    }

    return serialized;
  }

  /**
   * Clean content blocks by removing empty arrays and undefined values
   * Server requires array of content blocks, not simplified string
   */
  private cleanContent(content: any[]): any[] {
    // Always return as array of blocks (server requires this format)
    return content.map((block) => {
      const cleaned: any = {};

      for (const [key, value] of Object.entries(block)) {
        // Skip empty arrays
        if (Array.isArray(value) && value.length === 0) {
          continue;
        }
        // Skip undefined values
        if (value === undefined) {
          continue;
        }
        cleaned[key] = value;
      }

      return cleaned;
    });
  }
}
