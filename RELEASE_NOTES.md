# Release Notes

Human-facing notes for the current release. For the full history see
[CHANGELOG.md](CHANGELOG.md).

---

## 10xgraph-client 1.0.0

The first stable release of `10xgraph-client`, the TypeScript client of 10xGraph: open-source,
self-hosted infrastructure for AI applications. From 1.0 the public API (everything exported from
`src/index.ts`, and the package entry points) is stable until 2.0. A public export is removed only
after at least one minor release of deprecation.

```bash
npm install 10xgraph-client
```

Node.js 20 or newer. Released together with `10xgraph` 1.0.0 and `10xgraph-api` 1.0.0. Use the
client with `10xgraph-api` 1.0.

## Versioning from 1.0

- `major.minor` is identical across `10xgraph`, `10xgraph-api` and `10xgraph-client`.
  `10xgraph-client` 1.1.x works with `10xgraph-api` 1.1.x and `10xgraph` 1.1.x.
- Patch numbers move independently. A patch contains only bug or security fixes.
- A new feature means all three packages release the next `X.Y.0` together.
- The deprecated `AgentFlow*` aliases in `src/compat.ts` keep working and are removed in 2.0.

## What 1.0 brings since 0.6

- **A typed client for every endpoint.** Invoke, stream, threads, memory, files, graph operations,
  background tasks and `me()`, with typed responses.
- **`me()`** for `GET /v1/me`: who the caller is and what they may do (`user_id`, `tenant`, `roles`,
  `permissions`, `reach`), or `{ auth: 'off' }`.
- **Background tasks:** `runTask`, `scheduleTask`, `getTask`, `rescheduleTask` and `cancelTask` for
  the `/v1/tasks` routes.
- **Filters** on `threads()`, `searchMemory()`, `listMemories()` and `forgetMemories()`, with paging
  on `listMemories` and on thread lists.
- **Realtime and WebSocket streaming.** `wsStream()` and `realtime()` authenticate with the
  `10xgraph-bearer` subprotocol, with jittered reconnect backoff.
- **Typed errors that keep the server error code.** `RequestTimeoutError`, `NetworkError`,
  `WebSocketError`, `StreamError` and `RateLimitError` join the HTTP errors, and `errorCode` carries
  what the server sent (`EXPIRED_TOKEN`, `REVOKED_TOKEN`, `THREAD_NOT_FOUND`, ...).
- **Messages are real `Message` instances.** `result.messages.at(-1)?.text()` works on `invoke`,
  `stream`, WebSocket chunks and the thread endpoints.
- **Auth, requests and interrupts.** `authToken` can be a function called on every request,
  every method takes a `signal`, and `getInterrupt`, `approveInterrupt` and `rejectInterrupt`
  answer an open interrupt.

## Before you upgrade

### From 0.6

The API is source compatible with 0.6.0. Read these first:

- **Node.js 18 is no longer supported.** `engines` is `node >= 20.0.0`.
- **`addThreadMessages` is removed.** The server route is gone. Send messages through `invoke` or
  `stream`, and use `updateThreadMessageFeedback` for feedback.
- **`forgetMemories()` throws typed errors** (`ValidationError` for 422) instead of a plain `Error`.
- **`RealtimeSession.threadId` is now `string | null`.** Read it after the `session_started` event.
- **Streams throw when cut.** `stream()` and `wsStream()` throw `StreamError` or `WebSocketError`
  instead of ending as if the run had succeeded, and `timeout` is an idle timeout.
- **Timeouts and network failures are `RequestTimeoutError` and `NetworkError`,** not plain
  `Error`. Check the class, not the message text.
- **`searchMemory()` without a type now covers all memory types.** Pass `memory_type: 'episodic'`
  to keep the old behaviour.
- **Thread ids are server-assigned with `10xgraph-api` 1.0.** Omit `thread_id` on the first request
  of a conversation and reuse the id the server returns; an id the server never issued gets HTTP 404.
- **WebSocket auth needs `10xgraph-api` 0.7.0 or later.**

### From 1.0.0-rc.3

- Messages the server returns are now real `Message` instances on `invoke`, `stream`, WebSocket
  chunks, `threadMessages`, `singleMessage`, `threadState` and `updateThreadState`. New exports:
  `hydrateMessage`, `hydrateStateContext`, `hydrateChunk`.
- Typed HTTP errors keep the server's error code. The error classes take an optional trailing
  `errorCode`, and `errorCode` carries what the server sent. Without a code in the body, the class
  default is used as before.

See [CHANGELOG.md](CHANGELOG.md) for every change.
