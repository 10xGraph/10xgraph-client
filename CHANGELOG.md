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
- **From 1.0, `major.minor` is identical across `10xgraph`, `10xgraph-api` and
  `10xgraph-client`.** Use the client with a `10xgraph-api` of the same `major.minor`.
- **Patch numbers move independently.** A patch release contains only bug or security fixes.
- **Any new feature means all three packages release the next `X.Y.0` together.** A package with
  no changes in that release ships a "version alignment, no changes" entry.
- **Breaking changes need a new major version** (2.0), after a deprecation that lasted at least
  one minor release. The deprecated `AgentFlow*` aliases in `src/compat.ts` are removed in 2.0.

---

## [1.0.0] - Unreleased

The stable 1.0 release of `10xgraph-client`, aligned with `10xgraph` and `10xgraph-api` 1.0. It
includes everything in `1.0.0-rc.1` and `1.0.0-rc.2` below, plus the changes here. Use it with
`10xgraph-api` 1.0. The client API is source compatible with 0.6.0; the one hard requirement
change is Node.js 20.

### Breaking

- **Node.js 18 is no longer supported.** `engines` is `node >= 20.0.0` and Node 18 is removed
  from CI (CI runs Node 20 and 22). Node 18 is past end of life.

### Upgrade notes

- With `10xgraph-api` 1.0 a client that invents a thread id for a new conversation gets HTTP
  403. Omit `thread_id` on the first request and reuse the id the server returns (see
  `1.0.0-rc.1` below).
- Behaviour you may notice, none of it a signature change:
  - `stream()` and `wsStream()` now throw (`StreamError`, `WebSocketError`) when a stream is cut
    or the server closes the socket mid-run. Before, they ended as if the run had succeeded.
  - The `timeout` option is an idle timeout on `stream()` and `wsStream()`: it limits how long the
    client waits on the network, not how long the whole run takes.
  - A `baseUrl` with a trailing slash is accepted; the slashes are stripped.
  - Errors from timeouts and network failures are `RequestTimeoutError` and `NetworkError`, not
    plain `Error`. Code that matched on message text should check the class.

### Added

- `Interrupt` type, `getInterrupt(chunk)`, `approveInterrupt(interrupt, value?)` and
  `rejectInterrupt(interrupt)`. `getInterrupt` reads the pending interrupt from an `updates`
  chunk; the helpers return `{ resume, interrupt_id }` to spread into the options of
  `invoke()`, `stream()` or `wsStream()`.
- `authToken` accepts a function `() => string | null | undefined`, called on every request and
  on every realtime reconnect, so short-lived tokens refresh without rebuilding the client.
  `setAuthToken(token)` replaces it, and `clearAuth()` drops the bearer token and `auth`
  credentials.
- Every method that makes a request takes a `signal` option (`RequestOptions`), not only
  `invoke()`, `stream()` and `wsStream()`.
- New error classes and fields: `RequestTimeoutError`, `NetworkError`, `WebSocketError`,
  `StreamError` and `RateLimitError`. `RateLimitError` carries `retryAfterSeconds` from the
  `Retry-After` header or the body. Errors carry `cause`, `endpoint` and `method`, and
  `requestId` reads the `x-request-id` header.
- Remote tool registrations take `validate(args)` (throw or return `false` to refuse the call)
  and `maxArgsBytes` (default 1 MiB). The declared `parameters` are checked against the
  server-sent arguments before the handler runs, and a repeated call id is rejected.
- `listMemories` takes `offset`, and its response has `has_more` and `next_offset`, so a user with
  many memories can page. Needs `10xgraph-api` 1.0.
- CommonJS consumers get their own type declarations (`dist/cjs/index.d.ts`) through the
  `exports` map, so `require` works with `nodenext` type checking.

### Changed

- Live sessions without a `thread_id` now use the server-created id. The client no longer invents one: it sends none, reads the id from the new `session_started` event (`{ type: 'session_started', thread_id }`, the first server event) into `session.threadId` (`string | null`, set once the event arrives), and sends it back on reconnect so the same thread continues. A caller-supplied `thread_id` works as before. Needs `10xgraph-api` 1.0, where an invented id gets 403.
- **Typed change:** `RealtimeSession.threadId` is `string | null`. It is `null` until the
  `session_started` event arrives when you passed no `thread_id`, so code that read it as a
  `string` right after `realtime()` must handle `null` (or wait for `session_started`).
  `session.ready` still resolves when the socket opens, not on `session_started`, and the event is
  part of the `RealtimeEvent` union.
- The `timeout` is an idle timeout on `stream()` and `wsStream()`: it runs while the client waits
  for headers or the next piece of data and is paused while your code handles a chunk.
- `invoke()` and the other REST methods apply the timeout and your `signal` to the response body
  as well, not only to the response headers.
- Realtime reconnects use jittered backoff, restore the attempt budget only after a connection
  stayed open for 10 s, go straight to the longest delay on close code 1013, and stop with a fatal
  `policy_violation` error on close code 1008 (an expired or rejected token).
- Path ids (thread, message, memory) are percent-encoded in every endpoint.
- Header-type credentials other than `Authorization` (for example `X-API-Key`) are not forwarded
  on a cross-origin redirect; the call fails instead.
- The HTTP error mapping covers every JSON error body, including the real server's 409
  `state_conflict` body, and maps the server's codes (`RECURSION_001`, `STORAGE_TRANSIENT_000`,
  `STORAGE_SCHEMA_000`, `STORAGE_SERIALIZATION_000`) to `GraphRecursionError`,
  `TransientStorageError`, `SchemaVersionError` and `SerializationError`.
- Response and request types match what the server sends: fields the server never sends were
  removed from `AgentState` and `StopGraphResponse`, nullable fields are typed nullable, and
  `updateThreadState` no longer accepts keys the server rejects.
- `stream()` and `wsStream()` stop a client-tool loop at `recursion_limit`; `recursion_limit: 0`
  is honoured and not turned into 25.

### Fixed

- Leaving a `for await` loop over `stream()` early (`break`, `return` or a throw) cancels the
  request. Before, the connection and the server run stayed open and the thread answered 409.
- `wsStream()` no longer hangs when the server answers a frame with an error chunk, and it
  throws when the server closes the socket before the run finishes (1012, 1008, 1011).
- A truncated or unparseable stream line throws `StreamError` and a reset connection throws a
  `StreamError` with code `STREAM_INTERRUPTED`, not a raw `TypeError: terminated`.
- A conflict (HTTP 409) throws `ConflictError` against the real server. It used to throw a
  `TypeError`.
- `client.realtime()` no longer crashes the Node process with an unhandled rejection when the
  connection fails and `session.ready` was not awaited.
- Realtime: `close()` during a pending reconnect no longer reopens the session, `send*` before
  the socket is open is dropped and does not throw, and a failing reconnect does not end the
  process.
- Failed requests no longer leave the timeout timer running, so a script that catches a
  `ping()` error exits at once instead of after the timeout.
- Empty arrays are no longer stripped from messages and tool results, so a tool result with
  `output: []` reaches the model as an empty list.
- `recursion_limit_reached` is true only when the limit stopped the run, and a limit stop is
  reported to the caller instead of ending silently.
- Endpoint calls that time out throw `RequestTimeoutError`, not a raw `AbortError`, and
  `forgetMemories()` throws a typed error, not a plain `Error`.

---

## [1.0.0-rc.2] - Unreleased

All changes are additive. Several new response fields need `10xgraph-api` 1.0.0rc1 or later and are
typed optional, so the client still works against older servers.

### Added

- `signal?: AbortSignal` option on `invoke()`, `stream()` and `wsStream()`. Aborting it cancels the
  in-flight request (and the open stream body or WebSocket). The call rejects with the abort error
  (`name === 'AbortError'`), not the "Request timeout" error. A signal that is already aborted
  rejects before any request is sent.
- `listFiles(params?)` for `GET /v1/files` (`{ limit?, offset? }`), with `ListFilesRequest`,
  `ListFilesResponse`, `FileListItem`. A media store that cannot enumerate files answers 501,
  thrown as a `TenxGraphError`.
- `has_more`, `offset` and `limit` on the `threads()` and `threadMessages()` response data.
- Observability types for the run trace: per-span `status`, `error`, `inputs`, `outputs`, `step`,
  `visit`, `total_tokens`, `reasoning_tokens`, `tool_name`, `tool_call_id`; run-level `error`,
  `model`, `models`, `notes`; payload-level `enabled` and `reason` (`ObsEmptyReason`), so a UI can
  tell "tracing is off" from "no runs yet". New `ObsMessageSummary` type.
- `GraphInfo.realtime_options` (`GraphRealtimeOptions`): the Live init options the server honors, null
  for non-realtime graphs.
- Eval report types for the extended report: case `error` and `error` status, rubric
  `kind`, `passed`, `threshold`, `details`, `error`, case `expected_detail`, run `counts`, and
  `errors` on run summaries.

### Fixed

- `searchMemory()` no longer sends `memory_type: 'episodic'`, `category: ''` and
  `score_threshold: 0` when you leave them unset. They are omitted so the server applies no filter,
  and a search without a type now covers all memory types. Pass `memory_type` explicitly to keep
  the old episodic-only behavior.

---

## [1.0.0-rc.1] - 2026-10-28

Release candidate for 1.0. The version is aligned with `10xgraph` and `10xgraph-api` 1.0, which
ship as `1.0.0rc1` on PyPI; this package ships as `1.0.0-rc.1` on npm under the `next` tag, so
`npm install 10xgraph-client` still installs 0.6.0 until 1.0.0 is released. The client itself has
no breaking change in this release: the public API is the one listed under Added and Deprecated
below, on top of 0.6.0.

### Upgrading alongside 10xgraph-api 1.0

`10xgraph-api` 1.0 defaults `runs.thread_ids` to `"server"`. The server now assigns thread ids,
and a client that invents an id for a new thread gets HTTP 403 on `invoke()`, `stream()` and
`wsStream()`. No client code change is needed if you already let the server choose:

- On the first request of a conversation, omit `thread_id` from `config` (do not pass
  `config: { thread_id: ... }`).
- Read the id the server returns and reuse it in `config.thread_id` on every later request. For
  `invoke()` it is `result.meta.thread_id` (`meta.is_new_thread` tells you it was just created).
  For `stream()` it is `chunk.thread_id` or `chunk.metadata.thread_id` on the chunks. Over
  `wsStream()` the client sends no id on the first request (logged as `thread_id=new`), tracks
  the returned id itself and reuses it for its own resume requests; you still need to keep it
  for your next `wsStream()` call.
- Operators who want the old behavior set `"runs": {"thread_ids": "client"}` in `10xgraph.json`.

Use the client with `10xgraph-api` of the same `major.minor` (see the README compatibility
table).

### Added

- `on_busy?: 'wait' | 'cancel'` option on `invoke()`, `stream()` and `wsStream()`, sent as a
  top-level request field (in the WebSocket input object next to `recursion_limit`). It tells
  the server what to do when another run is active on the same thread: wait up to 30 s
  (server default) or cancel the running run. Needs a `10xgraph-api` version that supports it.
- `resume?: unknown` and `interrupt_id?: string` options on `invoke()`, `stream()` and
  `wsStream()`. `interrupt_id` must be the id of the interrupt being answered. The client does
  not track interrupt ids itself, so pass the id you got from the server. On `invoke()` and
  `stream()` they are sent on the first request of a call only.
- `ConflictError` (HTTP 409, `errorCode` `'CONFLICT'`), exported from the package root. The
  server answers 409 when the thread stays busy or when `interrupt_id` does not match the
  open interrupt. The client never retries it. Error bodies of the form `{"detail": "..."}`
  (no envelope) now produce a typed error with that message instead of throwing a `TypeError`.
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

### Fixed

- Client-side tool loop on `invoke()` and `stream()` lost a server-assigned thread id. When you
  omitted `config.thread_id` on the first request, the requests that send tool results also
  omitted it, so `10xgraph-api` 1.0 treated each one as a new thread and the tool round-trip
  broke or the conversation split. The client now reuses the id the server returns
  (`meta.thread_id` on `invoke()`; `thread_id` or `metadata.thread_id` on `stream()` chunks) for
  the following requests of the same call. A `thread_id` you pass is never replaced, and your
  `config` object is not modified.

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

[Unreleased]: https://github.com/10xGraph/10xgraph-client/compare/v1.0.0-rc.1...HEAD
[1.0.0-rc.1]: https://github.com/10xGraph/10xgraph-client/compare/v0.6.0...v1.0.0-rc.1
[0.6.0]: https://github.com/10xGraph/10xgraph-client/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/10xHub/agentflow-client/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/10xHub/agentflow-client/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/10xHub/agentflow-client/compare/v-0.2.0...v0.3.0
[0.2.0]: https://github.com/10xHub/agentflow-client/releases/tag/v-0.2.0
