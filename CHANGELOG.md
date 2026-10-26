# Changelog

All notable changes to `10xgraph-client` (formerly `@10xscale/agentflow-client`) are
documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Compatibility policy

- **Nothing public is removed without a deprecation cycle.** Anything exported from
  `src/index.ts` is public API. A public export is first marked deprecated with a
  `@deprecated` JSDoc tag, kept working for at least one subsequent minor release, and
  only then removed in a major release.
- **Moved modules keep a re-export shim** at the old path for at least one minor release.
- **Breaking changes are documented under a `### Breaking` heading**, with migration steps.
- The package entry points (`main`, `module`, `types`, `exports`) are part of the contract.
  Changing them is a breaking change.

---

## [Unreleased]

### Added

- `deleteFile(fileId)` wraps the new `DELETE /v1/files/{file_id}` route (permission
  `files:delete`, owner only). It resolves to `{ data: { file_id, deleted: true }, metadata }`.
  The server returns 404 "File not found" when the file does not exist or belongs to someone
  else. Types: `DeleteFileResponse`, `DeleteFileData`, `DeleteFileContext`.
- `updateThreadMessageFeedback(threadId, messageId, feedback)` wraps the new
  `PUT /v1/threads/{thread_id}/messages/{message_id}` route. It replaces
  `message.metadata.feedback` with the given JSON object and changes nothing else on the
  message. The server rejects feedback over 8192 serialized bytes or nested deeper than 10
  levels (HTTP 422), returns 404 if the message is not in the thread and 501 if its core
  library is too old. It returns the updated message in the same shape as `singleMessage`.
  Types: `UpdateThreadMessageFeedbackRequest`, `UpdateThreadMessageFeedbackResponse`,
  `UpdateThreadMessageFeedbackContext`.

### Deprecated

- `addThreadMessages` (`POST /v1/threads/{thread_id}/messages`) requires the
  `checkpointer:import` scope (admin only) in 10xgraph-api releases after 0.9.0, so a normal user gets
  403, and the server now rejects assistant and system role messages on normal client
  paths. Use `updateThreadMessageFeedback` to attach feedback to a message. The method is
  kept and still works for admin tokens.

---

## [0.6.0] - 2026-10-10

**First release as `10xgraph-client`.** The package formerly published as
`@10xscale/agentflow-client` (last version 0.5.0) is renamed along with the project:
Agentflow is now 10xGraph ([10xgraph.com](https://10xgraph.com),
[github.com/10xGraph/10xgraph-client](https://github.com/10xGraph/10xgraph-client)).

### Breaking

- **WebSocket bearer auth uses the `10xgraph-bearer` subprotocol** (`WS_BEARER_SUBPROTOCOL`),
  replacing `agentflow-bearer`. `10xgraph-api` 0.7.0 accepts both; an older
  `10xscale-agentflow-cli` server only knows the old name, so `wsStream()` and `realtime()`
  with bearer auth fail against it.

  **Migration:** upgrade the server to `10xgraph-api` >= 0.7.0. HTTP endpoints are unaffected.

- **`TenxGraphError.name` is `'TenxGraphError'`** (was `'AgentFlowError'`). Code that compares
  `error.name` should use `instanceof` instead.

### Changed

- npm package renamed: `npm install 10xgraph-client`, `import { ... } from '10xgraph-client'`.
- Exported names renamed: `TenxGraphClient`, `TenxGraphConfig`, `TenxGraphError`,
  `TenxGraphAuth`, `TenxGraphBearerAuth`, `TenxGraphBasicAuth`, `TenxGraphHeaderAuth`.
- Debug log prefix is `TenxGraphClient:`.
- Docs, examples and package metadata point at [10xgraph.com/docs](https://10xgraph.com/docs/client),
  the server's `10xgraph.json`, and the `10xGraph/10xgraph-client` repository.

### Deprecated

- `AgentFlowClient`, `AgentFlowConfig`, `AgentFlowError`, `AgentFlowAuth`,
  `AgentFlowBearerAuth`, `AgentFlowBasicAuth`, `AgentFlowHeaderAuth`. Each is exported from
  `src/compat.ts` as an alias of the same class or type, so existing code and `instanceof`
  checks keep working. Removed in 2.0.

### Compatibility

Requires `10xgraph-api` >= 0.7.0 for WebSocket bearer auth; verified against its current route
table (every endpoint the client calls exists with the same method, path and body).

---

## [0.5.0] - 2026-10-08

**Final release of `@10xscale/agentflow-client`.** Agentflow is now 10xGraph
([10xgraph.com](https://10xgraph.com), [github.com/10xGraph](https://github.com/10xGraph)).
No further versions will be published under this name; the TypeScript client continues
under the 10xGraph name. Installed copies keep working, and
`@10xscale/agentflow-client@0.5.0` can be pinned.

### Breaking

- **`client.setup()` is removed**, together with the `setupGraph` endpoint module and its
  exported types (`SetupGraphContext`, `SetupGraphRequest`, `SetupGraphResponse`,
  `RemoteTool`). The server removed `POST /v1/graph/setup` in `10xscale-agentflow-cli`
  0.6.0, so the call could no longer succeed against a current server. Clients can no longer
  define the schema the model sees.

  **Migration:** declare each client-executed tool (node, name, description, parameters)
  under `remote_tools` in the server's `agentflow.json`, and register only its handler on the
  client with `client.registerToolHandler(name, handler)`. Delete any `await client.setup()`
  call.

### Added

- `client.registerToolHandler(name, handler)` registers the client-side implementation of a
  remote tool whose schema is declared on the server.

### Changed

- `ToolRegistration.node` is optional. `registerTool()` still works; its `description` and
  `parameters` are no longer sent anywhere.
- `RealtimeInit.model` is optional. The server honours it only when the model is listed in
  `websocket.realtime_models`, and otherwise uses the agent's own model. `tools_tags` can only
  narrow the agent's own tag filter.
- `MultimodalConfigResponse.data` no longer declares `media_storage_path`; the server does not
  return it.
- Package metadata points at the client's own repository
  ([10xHub/agentflow-client](https://github.com/10xHub/agentflow-client)) and at
  [10xgraph.com](https://10xgraph.com).

### Compatibility

Requires `10xscale-agentflow-cli` >= 0.6.0, the first server release with `remote_tools` in
`agentflow.json`. It also works with the renamed server `10xgraph-api`, which still accepts the
`agentflow-bearer` WebSocket subprotocol this client sends.

---

## [0.4.0] - 2026-07-27

### Breaking

- **WebSocket auth: `auth` now takes precedence over `authToken`.** `resolveBearerToken()`
  previously checked `authToken` first and only fell back to `auth`. It now resolves `auth`
  first, matching `buildHeaders()` on the HTTP path, and returns `null` when `auth` is set to
  a non-bearer scheme instead of falling back to `authToken`. This affects `wsStream()` and
  `realtime()`.

  You are affected only if you set **both** `auth` and `authToken` on the client - a single
  credential behaves exactly as before. Two cases change:

  | Config                                                     | Before  | After  |
  | ---------------------------------------------------------- | ------- | ------ |
  | `auth: {type:'bearer', token:'b'}` + `authToken: 'tok'`    | `'tok'` | `'b'`  |
  | `auth: {type:'basic'\|'header', ...}` + `authToken: 'tok'` | `'tok'` | `null` |

  The rationale for the first case is consistency: `buildHeaders()` has always resolved `auth`
  before `authToken`, so the socket and the HTTP path now agree on which credential wins.

  The second case is the one to check before upgrading, because what still reaches the server
  depends on your runtime. `openWebSocket()` forwards only the `Authorization` header, and only
  to implementations that accept a third options argument:

  - **Basic auth on Node** (`ws`, or a passed `webSocketImpl`) - unaffected in practice. The
    `Authorization: Basic ...` header is still sent; you simply no longer also get an unrelated
    bearer subprotocol alongside it.
  - **Basic auth in a browser** - the socket now carries no credential. Browsers cannot set
    headers on a WebSocket, so the basic header is dropped and the bearer fallback is gone.
  - **Header auth (`{ type: 'header' }`) in any runtime** - the socket now carries no
    credential. A custom header name is never forwarded by `openWebSocket()`, in Node or the
    browser, and the bearer fallback is gone.

  **Migration:** if you hit one of the last two, pass the socket credential as bearer -
  `auth: { type: 'bearer', token }`, or drop `auth` and keep `authToken` - so the credential
  travels by the one mechanism the WebSocket endpoints accept in every runtime.

### Fixed

- **`ToolParameter.required` was mandatory, so all-optional tools did not typecheck**
  ([#12](https://github.com/10xHub/agentflow-client/issues/12)). In JSON Schema `required` is
  an optional keyword, but the interface declared it as `required: string[]`, so registering a
  tool whose arguments are all optional failed with `TS2741: Property 'required' is missing`
  unless the caller wrote `required: []` by hand. This hit exactly the read-only tools an agent
  calls most (`list_files`, `read_problems`, `read_terminal`, `read_diff`). `required` and
  `properties` are now both optional, so `parameters: { type: 'object' }` is valid for a tool
  that takes no arguments. `ToolParameter` also accepts arbitrary JSON Schema keywords
  (`additionalProperties`, `$defs`, ...) instead of rejecting them as excess properties.

  The change is backwards compatible - existing declarations that pass `required` keep working,
  and the wire format is unchanged: `client.setup()` and `ToolExecutor.all_tools()` now fill in
  the omitted keywords via the new exported `normalizeToolParameters()` helper, so the server
  still receives a complete `{ type, properties, required }` schema. Registrations with no
  `parameters` at all now serialize to `{ type: 'object', properties: {}, required: [] }`
  instead of a bare `{}`, which is a valid function schema for every provider.

- **`agent.ts` broke type resolution under `moduleResolution: nodenext`.** Its `./message`
  import was the only extensionless relative import in `src/`, so consumers on `node16`/
  `nodenext` - the recommended setting for modern Node projects - got `TS2834` from inside
  `dist/agent.d.ts`. Now imports `./message.js`, matching every other module.

- **The three thread-state endpoints rejected string thread IDs.** `threadState()`,
  `updateThreadState()`, and `clearThreadState()` typed `threadId` as `number`, while every
  other thread method (`threadDetails`, `threadMessages`, `addThreadMessages`, `singleMessage`,
  `deleteMessage`, `deleteThread`) already accepted `string | number`. The server types
  `thread_id` as a string in its request schemas, so the three outliers could not be passed a
  thread ID straight from a response without a cast. All three now take `string | number`,
  matching the rest of the surface.

  This widens a parameter type, so existing calls passing a `number` keep compiling.

### Added

- `normalizeToolParameters(parameters?)`, exported from `tools.ts` - applies the JSON Schema
  defaults (`type: 'object'`, `properties: {}`, `required: []`) to a partial tool schema.
- README: a version-compatibility table mapping client versions to `10xscale-agentflow-cli`
  (API server) and `10xscale-agentflow` (core) versions, since the three packages version
  independently and their numbers do not line up.

---

## [0.3.0] - 2026-07-21

### Fixed

- **`uploadFile()` threw on Node 18.** `File` only became a global in Node 20, and the
  upload path did an unguarded `file instanceof File`, so on Node 18 every call failed with
  `ReferenceError: File is not defined` - including calls passing a plain `Blob`, which
  never needed the global at all. The package declares `engines.node >= 18`, so this broke
  file upload for supported runtimes. The check is now guarded before it touches the
  global, and a regression test runs the upload path with `File` removed.
- **`npm publish` would have failed.** `@10xscale/agentflow-client` is a scoped package,
  and scoped packages default to `restricted`. Without `publishConfig.access: "public"`
  the publish is rejected. Added, along with `provenance: true`.
- **The build was not cross-platform.** `npm run build` ended in `cp -r dist-types/* dist/`,
  which does not exist on Windows, so Windows contributors could not build the package at
  all. `tsc` now emits declarations straight into `dist/` via `tsconfig.build.json`, and
  the `cp` step is gone.
- **Shipped sourcemaps did not resolve.** The tarball contained 41 `.map` files but no
  sources, so every map pointed at files the consumer did not have. `src/` is now included
  in `files`.
- **`NodeJS.Timeout` leaked into the public types.** `forgetMemories` annotated its timer
  with the `NodeJS` namespace, which forced every consumer - including browser-only ones -
  to install `@types/node`. Now uses the portable `ReturnType<typeof setTimeout>`.
- `Error.captureStackTrace` is now accessed structurally, so the build no longer depends
  on ambient Node typings.

### Added

- `client.graphTools()` - lists the tools exposed by the graph's tool nodes, grouped by
  node, each tagged with its source (`local` / `mcp` / `remote`). Types are exported from
  `endpoints/graphTools.ts`.
- `client.observability(threadId, runId?)` - returns the reconstructed trace (spans,
  events, cost) for a thread, defaulting to the latest run. Types are exported from
  `endpoints/observability.ts`.
- ESLint 9 (flat config) and Prettier, with `lint`, `format`, `typecheck`, and an
  aggregate `check` script.
- `tsconfig.build.json` for declaration emit, separate from the type-check config.
- CI workflow: lint + Prettier + `tsc --noEmit`, tests on Node 18/20/22, and a `package`
  job that verifies every declared entry point exists inside the actual tarball and smoke
  tests both the CJS and ESM entry points from a clean install.
- Release workflow gated on CI, with a tag-vs-`package.json` version check.
- CodeQL scanning and Dependabot.
- `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `RELEASE_NOTES.md`, issue forms,
  and a pull request template.

### Changed

- **Upgraded vitest 1.x to 3.x and vite 5.x to 7.x**, clearing all 11 reported
  vulnerabilities (3 critical, 5 high). `npm audit` now reports zero.
- Coverage thresholds raised and pinned to the measured numbers as a ratchet
  (72% lines/statements, 82% branches, 76% functions). Note that vitest 3 remaps v8
  coverage more accurately than vitest 1 did, so these read lower than the previous
  config claimed without any real change in what the tests exercise.
- `tsconfig.json` now type-checks `tests/` as well as `src/`; it previously covered only
  `src/`, so six type errors in the test suite had gone unnoticed. All are fixed.
- Twelve `@ts-ignore` comments became `@ts-expect-error`, which revealed that every one of
  them was suppressing nothing. All removed.

### Removed

- `check.ts` - an unreferenced scratch script at the repo root that imported from a
  non-existent `./dist/index.d.js`.
- `.npmignore` - dead configuration. `files` in `package.json` takes precedence, so this
  file had no effect and only invited confusion.
- Dead code in `src`: `makeSingleStreamCall` (`endpoints/stream.ts`),
  `isRemoteToolCallChunk` and `REMOTE_TOOL_CALL_REASON` (`endpoints/wsStream.ts`). All were
  unexported and unreferenced. Three unused imports in `client.ts` were also dropped; the
  types remain publicly exported from their own modules, so this is not an API change.

---

## [0.2.0]

Initial entry in this changelog. Releases before `0.2.0` were not tracked here.

- a2a, a2ui, and the React surface were removed.
- Added the realtime audio client (`client.realtime(...)` returning `RealtimeSession`).
- Added dual ESM/CJS exports.

[0.6.0]: https://github.com/10xGraph/10xgraph-client/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/10xHub/agentflow-client/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/10xHub/agentflow-client/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/10xHub/agentflow-client/compare/v-0.2.0...v0.3.0
[0.2.0]: https://github.com/10xHub/agentflow-client/releases/tag/v-0.2.0
