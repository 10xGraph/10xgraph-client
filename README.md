# 10xGraph Client

[![npm version](https://img.shields.io/npm/v/10xgraph-client.svg)](https://www.npmjs.com/package/10xgraph-client)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

The TypeScript client for the **10xGraph** API server. Build conversational AI applications with
streaming responses, realtime audio, client-side tool execution, and dynamic state management.

10xGraph by 10xScale: graph engineering for production AI agents.

> **Coming from `@10xscale/agentflow-client`?** This is the same client under its new name.
> Change the import and you are done; the old `AgentFlow*` names still work until 2.0. See
> [Migrating from `@10xscale/agentflow-client`](#migrating-from-10xscaleagentflow-client).

## Features

- **Simple API**: one client class with a method per server endpoint
- **Streaming**: HTTP and WebSocket streaming for chat UIs
- **Tool execution**: run browser-side tools locally, with recursion handling
- **State management**: dynamic state schema with validation
- **Realtime audio**: WebSocket audio-to-audio via `/v1/graph/live`
- **TypeScript first**: full type definitions, dual ESM + CJS

## Installation

```bash
npm install 10xgraph-client
# or
yarn add 10xgraph-client
# or
pnpm add 10xgraph-client
```

### Version compatibility

From 1.0, match `major.minor` across `10xgraph`, `10xgraph-api` and `10xgraph-client`; patch
versions are independent (a patch is only a bug or security fix). Before 1.0, pick versions by
this table:

| `10xgraph-client` (npm)                | API server                                        | Core framework                 |
| -------------------------------------- | ------------------------------------------------- | ------------------------------ |
| 1.0.x                                  | `10xgraph-api` 1.0.x                              | `10xgraph` 1.0.x               |
| 0.6.x                                  | `10xgraph-api` >= 0.7.0                           | `10xgraph` >= 0.10.0           |
| `@10xscale/agentflow-client` 0.5.x     | `10xscale-agentflow-cli` >= 0.6.0, `10xgraph-api` | `10xscale-agentflow` >= 0.10.0 |
| `@10xscale/agentflow-client` 0.3-0.4.x | `10xscale-agentflow-cli` >= 0.5.0                 | `10xscale-agentflow` >= 0.9.0  |

The client tracks the **API server**, which is what it talks to. Client 0.6.x and later authenticate
WebSockets with the `10xgraph-bearer` subprotocol, which `10xgraph-api` 0.7.0 introduced. Against
an older `10xscale-agentflow-cli` server, HTTP endpoints still work, but `wsStream()` and
`realtime()` with bearer auth do not; stay on `@10xscale/agentflow-client@0.5.0` until the server
is upgraded.

## Quick Start

### Basic usage

```typescript
import { TenxGraphClient, Message } from '10xgraph-client';

const client = new TenxGraphClient({
  baseUrl: 'http://localhost:8000',
  authToken: 'your-token', // optional bearer auth
  debug: true, // optional
});

const result = await client.invoke([Message.text_message('Hello, how can you help me?', 'user')]);

console.log(result.messages);
```

Start a local server with `10xgraph api` (from the `10xgraph-api` package).

### Authentication options

```typescript
import { TenxGraphClient, basicAuth, headerAuth } from '10xgraph-client';

const bearerClient = new TenxGraphClient({
  baseUrl: 'https://api.example.com',
  authToken: process.env.TENXGRAPH_TOKEN,
});

const basicClient = new TenxGraphClient({
  baseUrl: 'https://api.example.com',
  auth: basicAuth('service-user', 'service-password'),
});

const apiKeyClient = new TenxGraphClient({
  baseUrl: 'https://api.example.com',
  auth: headerAuth('X-API-Key', process.env.TENXGRAPH_API_KEY!),
});

const sessionClient = new TenxGraphClient({
  baseUrl: 'https://api.example.com',
  credentials: 'include',
});
```

### Streaming chat

```typescript
const stream = client.stream([Message.text_message('Tell me a story', 'user')]);

for await (const chunk of stream) {
  if (chunk.event === 'message') {
    console.log(chunk.message?.content);
  }
}
```

## Realtime audio (`/v1/graph/live`)

Transport-only: you stream PCM16 in and get PCM16 out. Mic capture and playback are yours to wire.

```ts
import { TenxGraphClient } from '10xgraph-client';

const client = new TenxGraphClient({ baseUrl: 'http://localhost:8000', authToken });

const session = client.realtime(
  { model: 'gemini-3.8-live', modalities: 'AUDIO' },
  { reconnect: { maxAttempts: 5 } }
);

session.on('audio', (pcm16, sampleRate) => playback(pcm16, sampleRate)); // PCM16 @ 24 kHz
session.on('output_transcript', (e) => console.log(e.text));
session.on('tool_call', (e) => console.log('tool', e.name, e.args));
session.on('error', (e) => console.error(e.message));

await session.ready; // socket open + init sent
session.sendAudio(micChunk); // PCM16 @ 16 kHz (Uint8Array | ArrayBuffer)
// push-to-talk: session.activityStart() / session.activityEnd()
session.close(); // graceful end; disables reconnect
```

Auth uses the browser-safe `10xgraph-bearer` subprotocol automatically. In Node < 21 (no global
`WebSocket`), pass an implementation:

```ts
import WebSocket from 'ws';
const client = new TenxGraphClient({ baseUrl, authToken, webSocketImpl: WebSocket });
```

### File uploads and access URLs

```typescript
const upload = await client.uploadFile(file);

// Best URL for rendering/downloading in the UI.
// Cloud-backed deployments typically return a signed URL here.
const accessUrl = upload.data.direct_url ?? upload.data.url;

const fileInfo = await client.getFileInfo(upload.data.file_id);
const fileUrl = await client.getFileAccessUrl(upload.data.file_id);

const msg = Message.withFile('Summarize this document', upload.data.file_id, upload.data.mime_type);
```

### Tool registration

**Important:** remote tools (registered client-side) should **only** be used for browser-level APIs
like `localStorage` or `navigator.geolocation`. For most operations (database queries, external API
calls, calculations), define your tools in the Python backend instead. See
[Remote tools](https://10xgraph.com/docs/client/remote-tools) for details.

```typescript
// Matching trusted schema must be declared in the server's 10xgraph.json.
client.registerToolHandler('get_weather', async ({ location }) => {
  return { temperature: 72, conditions: 'sunny' };
});

// Tools execute automatically during invoke
const result = await client.invoke([Message.text_message('What is the weather in NYC?', 'user')]);
```

Declare model-facing metadata in the server's `10xgraph.json`, never from an untrusted client:

```json
{
  "remote_tools": [
    {
      "node": "assistant",
      "name": "get_weather",
      "description": "Get current weather for a location",
      "parameters": {
        "type": "object",
        "properties": { "location": { "type": "string" } },
        "required": ["location"]
      }
    }
  ]
}
```

No client setup call is required or available.

## Documentation

Full documentation lives at **[10xgraph.com/docs](https://10xgraph.com/docs/client)**.

### Guides

- **[Create a client](https://10xgraph.com/docs/client/create-client)**: setup and first request
- **[Invoke an agent](https://10xgraph.com/docs/client/invoke-agent)**: request/response with tool execution
- **[Stream responses](https://10xgraph.com/docs/client/stream-responses)**: real-time streaming
- **[Remote tools](https://10xgraph.com/docs/client/remote-tools)**: when to use client-side tools
- **[Realtime audio](https://10xgraph.com/docs/client/realtime-audio)**: the `/v1/graph/live` session
- **[Error handling](https://10xgraph.com/docs/client/error-handling)**: error classes and recovery

### Reference

- **[`TenxGraphClient`](https://10xgraph.com/docs/reference/client/client)**: constructor config and every method
- **[`Message` and content blocks](https://10xgraph.com/docs/reference/client/message)**
- **[Auth](https://10xgraph.com/docs/reference/client/auth)** and **[Errors](https://10xgraph.com/docs/reference/client/errors)**
- **[Troubleshooting](https://10xgraph.com/docs/troubleshooting/client)**: common issues and solutions

## Key APIs

### `invoke()`: batch processing

Execute the agent with an automatic tool execution loop:

```typescript
const result = await client.invoke(messages, {
  recursion_limit: 25,
  response_granularity: 'full',
});
```

Optional: `on_busy: 'wait' | 'cancel'` controls what happens when the thread already has an active
run, and `resume` with `interrupt_id` answers an open interrupt. A 409 throws `ConflictError`
(not retried automatically).

### `stream()`: real-time streaming

```typescript
const stream = client.stream(messages);
for await (const chunk of stream) {
  // Process chunks in real-time
}
```

### `graphStateSchema()`: dynamic schema

Get the agent state schema for form generation and validation:

```typescript
const schema = await client.graphStateSchema();
```

### `graphTools()`: tool inventory

List the tools the graph's tool nodes expose, grouped by node. Each tool is tagged with its
source (`local`, `mcp`, or `remote`):

```typescript
const { data } = await client.graphTools();
// data.nodes[].tools[] -> { name, description, source, parameters }
```

### `observability(threadId, runId?)`: run traces

Fetch the reconstructed trace for a run (spans, events, and cost). Defaults to the thread's
latest run:

```typescript
const trace = await client.observability(threadId);
const specific = await client.observability(threadId, runId);
```

## Examples

The [`examples/`](examples/) directory has complete working examples:

- **[invoke-example.ts](examples/invoke-example.ts)**: basic invoke with tool execution
- **[stream-example.ts](examples/stream-example.ts)**: streaming responses
- **[state-schema-examples.ts](examples/state-schema-examples.ts)**: form generation and validation

## Architecture

```
┌──────────────────────┐
│   Your application   │
└──────────┬───────────┘
           │ TenxGraphClient
           ▼
┌──────────────────────┐
│   10xgraph-client    │  <- this library
│   client, tools,     │
│   messages           │
└──────────┬───────────┘
           │ HTTP/HTTPS + WebSocket
           ▼
┌──────────────────────┐
│   10xgraph-api       │  <- your backend
│   (10xgraph api)     │
└──────────────────────┘
```

## Configuration

```typescript
const client = new TenxGraphClient({
  baseUrl: string,           // Required: API base URL
  authToken?: string,        // Optional: bearer token
  auth?: TenxGraphAuth,      // Optional: bearer/basic/custom header auth
  headers?: HeadersInit,     // Optional: extra headers for every request
  credentials?: RequestCredentials, // Optional: cookie/session auth
  timeout?: number,          // Optional: request timeout (default: 5 min)
  debug?: boolean,           // Optional: enable debug logging
  webSocketImpl?: typeof WebSocket  // Node < 21 (pass the 'ws' package)
});
```

## Migrating from `@10xscale/agentflow-client`

The project was renamed from Agentflow to **10xGraph** because "Agentflow" is shared by several
unrelated projects and was hard to find. The client, license and maintainers are the same.

| Before                                                 | After                                |
| ------------------------------------------------------ | ------------------------------------ |
| `npm install @10xscale/agentflow-client`               | `npm install 10xgraph-client`        |
| `AgentFlowClient`, `AgentFlowConfig`                   | `TenxGraphClient`, `TenxGraphConfig` |
| `AgentFlowError`                                       | `TenxGraphError`                     |
| `AgentFlowAuth` (+ `Bearer`/`Basic`/`Header` variants) | `TenxGraphAuth` (+ same variants)    |
| WS subprotocol `agentflow-bearer`                      | `10xgraph-bearer`                    |
| Server `10xscale-agentflow-cli`, `agentflow.json`      | `10xgraph-api`, `10xgraph.json`      |

Steps:

1. `npm uninstall @10xscale/agentflow-client && npm install 10xgraph-client`
2. Replace `'@10xscale/agentflow-client'` with `'10xgraph-client'` in your imports.
3. Upgrade the server to `10xgraph-api` >= 0.7.0 if you use `wsStream()` or `realtime()`.
4. Optionally rename `AgentFlow*` identifiers to `TenxGraph*`. The old names are exported as
   deprecated aliases of the same classes and types, so `instanceof AgentFlowError` keeps working.
   They are removed in 2.0.

One observable difference: errors now report `error.name === 'TenxGraphError'` instead of
`'AgentFlowError'`. Use `instanceof` rather than comparing names.

## Module formats

Ships dual ESM + CJS with types. `import` resolves `dist/index.js` (ESM); `require` resolves
`dist/index.cjs`. Tree-shakeable (`"sideEffects": false`).

## Testing

```bash
npm test          # watch mode
npm run test:run  # run once
npm run build     # build the library
```

## TypeScript support

```typescript
import type {
  TenxGraphClient,
  Message,
  ToolRegistration,
  InvokeResult,
  StreamChunk,
  AgentState,
  AgentStateSchema,
} from '10xgraph-client';
```

## Contributing

**Be the first community contributor on this wall.**

<a href="https://github.com/10xGraph/10xgraph-client/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=10xGraph/10xgraph-client" alt="People who have contributed to the 10xGraph TypeScript client" />
</a>

So far only the lead maintainer has committed here, so the first community spot is open. Merge one pull request and your avatar is the next one on this wall and on the contributor page at [10xgraph.com/maintainers](https://10xgraph.com/maintainers). This client is how frontends talk to production agents, so the work is used from day one.

Your first pull request can be small. These are real, self-contained, and useful today:

- **Add an example for your framework.** [`examples/`](examples/) has plain TypeScript and React. Vue, Svelte, Next.js and Node scripts are all missing.
- **Test an edge case you hit.** A stream that drops mid-response, an error body the client should map, an auth header that should win.
- **Sharpen a type or a doc comment.** If your editor's autocomplete misled you once, it will mislead the next person too.
- **Turn a bug into a failing test.** Open it as a draft pull request; the fix can come later.

From clone to a passing check (Node 20 or newer):

```bash
git clone https://github.com/10xGraph/10xgraph-client.git
cd 10xgraph-client
npm ci
npm run check   # lint, typecheck and tests: the same gate as CI
```

Draft pull requests are welcome, so open early and ask questions in the PR. For bigger changes, start a thread in the core repository's [Discussions](https://github.com/10xGraph/10xGraph/discussions) first. [CONTRIBUTING.md](CONTRIBUTING.md) has every check and the release notes rules.

## License

10xGraph is [MIT licensed](LICENSE) and made by [10xScale](https://10xscale.ai). Contributions are
accepted under the same license.

## Support

- [Documentation](https://10xgraph.com/docs/client)
- [Issue tracker](https://github.com/10xGraph/10xgraph-client/issues)
- [npm package](https://www.npmjs.com/package/10xgraph-client)
- [10xgraph.com](https://10xgraph.com) and [github.com/10xGraph](https://github.com/10xGraph)
