# 10xGraph Client

[![npm version](https://img.shields.io/npm/v/10xgraph-client.svg)](https://www.npmjs.com/package/10xgraph-client)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

The typed TypeScript client for 10xGraph, infrastructure for AI applications. It talks to the
`10xgraph-api` server from any frontend or Node app: invoke, stream, threads, memory, files,
background tasks, remote tools and realtime audio.

> 10xGraph is open-source, self-hosted infrastructure for AI applications. You write the agents, tools and tasks; 10xGraph runs them behind an API server with authentication, role-based access, tenant isolation, durable state in Postgres and Redis, background jobs, metrics and tracing, and generates Docker and Kubernetes deploy files. MIT licensed, by 10xScale. Formerly Agentflow.

> **Coming from `@10xscale/agentflow-client`?** This is the same client under its new name. Change
> the import and you are done; the old `AgentFlow*` names still work until 2.0. See
> [Migrating from `@10xscale/agentflow-client`](#migrating-from-10xscaleagentflow-client).

## Install

```bash
npm install 10xgraph-client
# or: yarn add 10xgraph-client / pnpm add 10xgraph-client
```

Node 20 or newer. It uses the global `fetch`, ships ESM and CJS with types, and works with any
frontend framework. There are no React hooks; call the client from your own state code.

The client talks to a `10xgraph-api` server, so run one first. Match `major.minor` across
`10xgraph`, `10xgraph-api` and `10xgraph-client` (patch versions are independent). WebSocket auth
(`wsStream()` and `realtime()`) uses the `10xgraph-bearer` subprotocol, which needs `10xgraph-api`
1.0. See [Run the server](https://10xgraph.com/docs/server/run-the-server).

## Quickstart

```typescript
import { TenxGraphClient, Message } from '10xgraph-client';

const client = new TenxGraphClient({
  baseUrl: 'http://localhost:8000',
  authToken: token, // a bearer token for the signed-in user
});

// Request and response. Remote tools run automatically during invoke.
const result = await client.invoke(
  [Message.text_message('Where is my order 1042?', 'user')],
  { config: { thread_id: 'support-1042' } }
);
console.log(result.messages);

// Server-sent events
for await (const chunk of client.stream([Message.text_message('And the refund status?', 'user')], {
  config: { thread_id: 'support-1042' },
})) {
  if (chunk.event === 'message') console.log(chunk.message?.content);
}
```

`stream()` returns an async generator of `StreamChunk`. `wsStream()` takes the same arguments and
streams over a WebSocket. Both accept `initial_state`, `config`, `recursion_limit`, `on_busy`
(`'wait' | 'cancel'`), `resume` with `interrupt_id`, `response_granularity` and `signal` (an
`AbortSignal` that cancels the request). A 409 throws `ConflictError` and is not retried.

To answer a human-in-the-loop interrupt, read it from a chunk and resume the thread:

```typescript
import { getInterrupt, approveInterrupt, rejectInterrupt } from '10xgraph-client';

const interrupt = getInterrupt(chunk); // null when the chunk carries none
if (interrupt) {
  await client.invoke([], { config: { thread_id }, ...approveInterrupt(interrupt) });
  // or ...rejectInterrupt(interrupt)
}
```

## What the client covers

| Area | Methods |
| --- | --- |
| Runs | `invoke`, `stream`, `wsStream`, `stopGraph` |
| Identity and server | `ping`, `me`, `graph`, `graphTools`, `graphStateSchema`, `observability` |
| Threads and messages | `threads`, `threadDetails`, `threadMessages`, `singleMessage`, `deleteMessage`, `updateThreadMessageFeedback`, `deleteThread` |
| Thread state | `threadState`, `updateThreadState`, `clearThreadState` |
| Memory store | `storeMemory`, `searchMemory`, `getMemory`, `updateMemory`, `deleteMemory`, `listMemories`, `forgetMemories` |
| Files | `uploadFile`, `getFile`, `listFiles`, `getFileInfo`, `getFileAccessUrl`, `deleteFile`, `getMultimodalConfig` |
| Background tasks | `runTask`, `scheduleTask`, `getTask`, `rescheduleTask`, `cancelTask` |
| Remote tools | `registerTool`, `registerToolHandler` |
| Realtime audio | `realtime` |

Every method that does not return a stream accepts a per-call `options` argument with an
`AbortSignal`. The full list with types is in the
[`TenxGraphClient` reference](https://10xgraph.com/docs/reference/client/client).

### Threads, memory and files

```typescript
const page = await client.threads({ limit: 20 });
const messages = await client.threadMessages('support-1042', { limit: 50 });

const upload = await client.uploadFile(file);
const msg = Message.withFile('Summarize this document', upload.data.file_id, upload.data.mime_type);
const accessUrl = await client.getFileAccessUrl(upload.data.file_id);
```

### Background tasks

Tasks marked `http=True` on the server can be started and read from the client:

```typescript
const { data } = await client.runTask('web_add', { kwargs: { a: 1, b: 2 } });
const task = await client.getTask(data.task_id);
```

`scheduleTask` takes a `schedule` with exactly one of `cron`, `at` or `every`; the server answers
501 when it has no Redis. See [Background tasks](https://10xgraph.com/docs/server/background-tasks).

## Authentication and secure frontends

```typescript
import { TenxGraphClient, basicAuth, headerAuth } from '10xgraph-client';

new TenxGraphClient({ baseUrl, authToken: token }); // bearer token
new TenxGraphClient({ baseUrl, authToken: () => session.accessToken }); // called before each request
new TenxGraphClient({ baseUrl, auth: basicAuth('service-user', 'service-password') });
new TenxGraphClient({ baseUrl, auth: headerAuth('X-API-Key', apiKey) });
new TenxGraphClient({ baseUrl, credentials: 'include' }); // cookie sessions
```

`setAuthToken(token)` swaps the token on a live client and `clearAuth()` removes it.

- The server decides who the caller is and what they may read. The client only carries the
  identity. Roles, tenant columns and ownership are enforced on the server.
- Anything in a browser bundle is readable by the person using it, including `NEXT_PUBLIC_*`
  variables. Never put a shared API key, a signing secret or a service credential in frontend code.
  Use a server-side proxy that holds the secret, or give each signed-in user a short-lived token.
- Browsers cannot set headers on a WebSocket. For `wsStream()` and `realtime()` the client sends
  the token as the second entry of the `Sec-WebSocket-Protocol` list, after the `10xgraph-bearer`
  sentinel (`WS_BEARER_SUBPROTOCOL`). The token never goes in the URL.
- In Node versions without a global `WebSocket` (before 21), pass an implementation:

```typescript
import WebSocket from 'ws';
const client = new TenxGraphClient({ baseUrl, authToken, webSocketImpl: WebSocket });
```

More in [Secure your frontend](https://10xgraph.com/docs/client/secure-your-frontend) and the
[security model](https://10xgraph.com/docs/production/security-model).

## Remote tools

Remote tools run in the user's browser, for browser-only APIs such as `localStorage` or
`navigator.geolocation`. Database queries, external API calls and calculations belong in tools on
the server.

```typescript
// The matching schema must be declared in the server's 10xgraph.json.
client.registerToolHandler('get_location', async () => {
  const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject)
  );
  return { lat: pos.coords.latitude, lon: pos.coords.longitude };
});

// The server asks for the tool during the run; the client runs it and sends the result back.
const result = await client.invoke([Message.text_message('Find a store near me', 'user')]);
```

Model-facing metadata is declared on the server, never by an untrusted client:

```json
{
  "remote_tools": [
    {
      "node": "assistant",
      "name": "get_location",
      "description": "Get the user's current coordinates",
      "parameters": { "type": "object", "properties": {} }
    }
  ]
}
```

No client setup call is required or available. See
[Remote tools](https://10xgraph.com/docs/client/remote-tools).

## Realtime audio

Transport only: you stream PCM16 in and get PCM16 out, and wire microphone capture and playback
yourself.

```typescript
const session = client.realtime(
  { model: 'gemini-3.8-live', modalities: 'AUDIO' },
  { reconnect: { maxAttempts: 5 } }
);

session.on('audio', (pcm16, sampleRate) => playback(pcm16, sampleRate)); // PCM16 @ 24 kHz
session.on('output_transcript', (e) => console.log(e.text));
session.on('tool_call', (e) => console.log('tool', e.name, e.args));
session.on('error', (e) => console.error(e.message));

await session.ready; // socket open and init sent
session.sendAudio(micChunk); // PCM16 @ 16 kHz (Uint8Array | ArrayBuffer)
// push-to-talk: session.activityStart() / session.activityEnd()
session.close(); // graceful end; disables reconnect
```

The server honours `model` only when it lists it in `websocket.realtime_models`. See
[Realtime audio](https://10xgraph.com/docs/client/realtime-audio).

## Errors

Every failure is a `TenxGraphError` or a subclass, so `instanceof` works:

```typescript
import { TenxGraphError, AuthenticationError, RateLimitError, ConflictError } from '10xgraph-client';

try {
  await client.invoke(messages);
} catch (err) {
  if (err instanceof RateLimitError) {
    await sleep((err.retryAfterSeconds ?? 1) * 1000); // set when the server sends a hint
  } else if (err instanceof AuthenticationError) {
    // refresh the token
  } else if (err instanceof TenxGraphError) {
    console.error(err.statusCode, err.errorCode, err.requestId, err.message);
  } else {
    throw err;
  }
}
```

Other subclasses include `PermissionError`, `NotFoundError`, `ValidationError`, `ServerError`,
`RequestTimeoutError`, `NetworkError`, `WebSocketError` and `StreamError`. See
[Error handling](https://10xgraph.com/docs/client/error-handling).

## Configuration

```typescript
const client = new TenxGraphClient({
  baseUrl: string,           // Required: API base URL
  authToken?: string | (() => string | null | undefined), // Optional: bearer token or getter
  auth?: TenxGraphAuth,      // Optional: bearer/basic/custom header auth
  headers?: HeadersInit,     // Optional: extra headers for every request
  credentials?: RequestCredentials, // Optional: cookie/session auth
  timeout?: number,          // Optional: request timeout (default: 5 min)
  debug?: boolean,           // Optional: enable debug logging
  webSocketImpl?: typeof WebSocket  // Node < 21 (pass the 'ws' package)
});
```

## One stack, backend to frontend

| Layer | Package | What it is |
| --- | --- | --- |
| Core | [`10xgraph`](https://github.com/10xGraph/10xGraph) (PyPI, import `tenxgraph`) | Graphs, agents, tools, state, storage |
| Server | [`10xgraph-api`](https://github.com/10xGraph/10xgraph-api) (PyPI, command `10xgraph`) | API server, auth, jobs, deploy files |
| Client | `10xgraph-client` (this package) | Typed TypeScript client |
| Docs | [10xgraph.com/docs/client](https://10xgraph.com/docs/client) | Guides and reference |

Start a local server with `10xgraph dev`. For a Next.js or React app see
[Next.js and React](https://10xgraph.com/docs/client/nextjs-and-react).

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
3. Upgrade the server to `10xgraph-api` 1.0 if you use `wsStream()` or `realtime()`.
4. Optionally rename `AgentFlow*` identifiers to `TenxGraph*`. The old names are exported as
   deprecated aliases of the same classes and types, so `instanceof AgentFlowError` keeps working.
   They are removed in 2.0.

One observable difference: errors now report `error.name === 'TenxGraphError'` instead of
`'AgentFlowError'`. Use `instanceof` rather than comparing names.

## Module formats

Ships dual ESM + CJS with types. `import` resolves `dist/index.js` (ESM); `require` resolves
`dist/index.cjs`. Tree-shakeable (`"sideEffects": false`).

## TypeScript support

```typescript
import type {
  TenxGraphConfig,
  ToolRegistration,
  InvokeResult,
  StreamChunk,
  AgentState,
} from '10xgraph-client';
```

## Testing

```bash
npm test          # watch mode
npm run test:run  # run once
npm run build     # build the library
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
