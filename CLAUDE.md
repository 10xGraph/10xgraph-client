# 10xgraph-client (TypeScript SDK) — Engineering Guide

This file documents the **TypeScript/JS client SDK** only (`10xgraph-client`). For the
API server it talks to, see `agentflow-api/CLAUDE.md` (`10xgraph-api`); for the core framework see
`agentflow/CLAUDE.md`; for the monorepo overview see the workspace-root `CLAUDE.md`.

- Package name (npm): `10xgraph-client` (formerly `@10xscale/agentflow-client`, last release 0.5.0)
- Repo: https://github.com/10xGraph/10xgraph-client
- Version: `0.6.0` (first release under the 10xGraph name) · License: MIT · `"type": "module"` (ESM-first)
- Runtime: Node >= 18 (uses global `fetch`); also browser-targetable
- Language: TypeScript 5+, built with `tsc` + Vite 7, tested with Vitest 3

## What this package is

A typed client for the `10xgraph-api` HTTP + WebSocket surface. One class, `TenxGraphClient`,
exposes a method per server endpoint (invoke, stream, threads, checkpointer state, memory store,
files) plus **client-side tool execution** (the server asks the client to run a registered tool,
the client runs it locally and returns the result, with recursion handling).

## Rename compatibility (kept until 2.0)

| Old name                                                                                                                                    | New name                                    | How the old one keeps working                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm `@10xscale/agentflow-client`                                                                                                            | `10xgraph-client`                           | 0.5.0 stays installable; no further releases under the old name                                                                                                     |
| `AgentFlowClient`, `AgentFlowConfig`, `AgentFlowError`, `AgentFlowAuth`, `AgentFlowBearerAuth`, `AgentFlowBasicAuth`, `AgentFlowHeaderAuth` | `TenxGraph*`                                | `src/compat.ts` re-exports each as a `@deprecated` alias of the same class/type (`instanceof` still works); covered by `tests/compat.test.ts` and the CI smoke test |
| WS subprotocol `agentflow-bearer`                                                                                                           | `10xgraph-bearer` (`WS_BEARER_SUBPROTOCOL`) | Not kept on the client: it sends only the new name, so WebSocket bearer auth needs `10xgraph-api` >= 0.7.0 (which accepts both)                                     |

Behaviour change: the base error's `name` is `'TenxGraphError'`. Delete `src/compat.ts` and
its export in `src/index.ts` for 2.0.

## Package layout

Entry point: `src/index.ts` -> `dist/index.js`. Source map:

| Path             | What lives there                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/client.ts`  | `TenxGraphClient` (the main class) and `TenxGraphConfig`                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `src/agent.ts`   | `AgentState` (dynamic state container + `ExecutionMeta`). Note: this is NOT a high-level "Agent" wrapper class                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/tools.ts`   | Client-side tool execution: `ToolExecutor`, `ToolRegistration`, `ToolHandler`, `Tool`, `ToolDefinition`                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/message.ts` | Message + content-block model mirroring the Python core (`TextBlock`, `ImageBlock`, `AudioBlock`, `VideoBlock`, `DocumentBlock`, `DataBlock`, `ToolCallBlock`, `RemoteToolCallBlock`, `MediaRef`, `AnnotationRef`, ...)                                                                                                                                                                                                                                                                           |
| `src/request.ts` | Low-level request/auth helpers; `TenxGraphAuth` (Bearer / Basic / Header), `RequestContext`                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/errors.ts`  | Error types                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/endpoints/` | One file per endpoint (request/response types + call impl): invoke, stream, wsStream, graph, graphTools, observability, stopGraph, fixGraph, stateSchema, threads, threadDetails, threadState, updateThreadState, clearThreadState, threadMessages, addThreadMessages, threadMessage, deleteThreadMessage, updateThreadMessageFeedback, deleteThread, storeMemory, searchMemory, getMemory, updateMemory, deleteMemory, listMemories, forgetMemories, files, deleteFile, metadata, ping, realtime |
| `src/ws.ts`      | Shared WebSocket plumbing: subprotocol auth, URL building, injectable impl                                                                                                                                                                                                                                                                                                                                                                                                                        |

## `TenxGraphClient`

```typescript
import { TenxGraphClient, Message } from '10xgraph-client';

const client = new TenxGraphClient({
  baseUrl: 'http://localhost:8000', // required
  // authToken?: string | null
  // auth?: TenxGraphAuth | null      // Bearer | Basic | Header
  // headers?: HeadersInit
  // credentials?: RequestCredentials
  // timeout?: number                 // default 5 min
  // debug?: boolean
  // webSocketImpl?: typeof WebSocket   // Node < 21 (pass the 'ws' package)
});
```

Methods map 1:1 onto the server (`10xgraph-api`) endpoints. Verified 2026-10-08 against
the API route table: every client call exists on the server with the same method, path and
body. Server routes the client deliberately does not wrap: `POST /v1/ag-ui` (for CopilotKit /
AG-UI clients) and `GET /v1/evals/runs[/{run_id}]` (dev-only playground view model).

- **Graph lifecycle:** `ping()`, `graph()`, `stopGraph(threadId, config?)`,
  `fixGraph(threadId, config?)`, `graphStateSchema()`, `graphTools()`,
  `observability(threadId, runId?)`.
- **Run:** `invoke(...)`, `stream(...)` (HTTP streaming), `wsStream(...)` (WebSocket),
  `realtime(init, options?)` (WebSocket audio-to-audio, transport-only; returns a `RealtimeSession`).
- **Threads / checkpointer:** `threads()` / `threads(request)`, `threadDetails(id)`,
  `threadState(id)`, `updateThreadState(...)`, `clearThreadState(id)`, `threadMessages(...)`,
  `addThreadMessages(...)` (deprecated, admin-only), `singleMessage(...)`,
  `updateThreadMessageFeedback(threadId, messageId, feedback)`, `deleteMessage(...)`, `deleteThread(...)`.
- **Memory store:** `storeMemory`, `searchMemory`, `getMemory`, `updateMemory`, `deleteMemory`,
  `listMemories`.
- **Files / multimodal:** `uploadFile(...)`, `getFile(id) -> Blob`, `getFileAccessUrl(id)`,
  `deleteFile(id)` (owner only, needs `files:delete`), `getMultimodalConfig()`.
- **Tools:** `registerToolHandler(name, handler)` for client-side execution; trusted schemas are
  loaded by the server from `10xgraph.json` at startup.

## Client-side tool execution

`tools.ts` lets the browser/Node client own a tool's implementation. Register a handler with
`client.registerToolHandler(name, handler)`; the `ToolExecutor` runs it when the server requests
that configured tool, then feeds the result back. Good for browser-only capabilities
(geolocation, clipboard, DOM, local state).

## Auth

`TenxGraphAuth` is a union: `TenxGraphBearerAuth | TenxGraphBasicAuth | TenxGraphHeaderAuth`.
Pass via `auth` in the config, or use the simpler `authToken` for bearer tokens.

## Development workflow

```bash
# from this folder (agentflow-client/, repo 10xgraph-client)
npm install
npm run build        # rimraf dist + tsc declarations + vite bundle (no `cp`)
npm test             # vitest (watch)
npm run test:run     # vitest run (CI)
npm run test:coverage
```

- Tests live in `tests/` (38 vitest files, 561 tests, one per endpoint/feature).
  `prepublishOnly` runs the full `check` gate then builds.
- `examples/` shows usage. `check.ts` was removed in the readiness pass (unreferenced scratch
  script importing a non-existent path).
- Lint/format/types: `npm run check` = eslint + `tsc --noEmit` + vitest. `tsconfig.json`
  type-checks `tests/` as well as `src/`; `tsconfig.build.json` is declaration-emit only.

## Known doc drift (do not trust without checking)

- **There is no `Agent` class.** The workspace-root `CLAUDE.md` says "`Agent` class (TS) lives in
  `agentflow-client/src/agent.ts` (high-level client wrapper)". `agent.ts` actually defines
  `AgentState`. The high-level entry point is `TenxGraphClient` in `src/client.ts`.
- **0.2.0 changes:** a2a, a2ui, and the React surface were removed. The realtime audio client
  (`client.realtime(...)` returning `RealtimeSession`) and dual ESM/CJS exports were added.

- **Do not reference the `NodeJS` namespace in `src/`.** This package targets browsers too;
  ambient Node typings force every consumer to install `@types/node`. Use portable forms
  such as `ReturnType<typeof setTimeout>`.
- **`publishConfig.access: "public"`** was load-bearing for the old scoped name and is harmless
  now. Do not add `provenance: true` while publishing is a manual `npm publish`: provenance only
  works from a CI provider with OIDC, so a local publish fails with it set.
- **Build scripts must be cross-platform.** The old `cp -r dist-types/* dist/` broke Windows.
  Also note `vite build` empties `outDir` by default, so declaration emit and bundling must
  not fight over `dist/` (`emptyOutDir: false` plus an explicit `clean` step).
