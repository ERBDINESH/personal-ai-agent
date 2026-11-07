# Swift Personal AI — Architecture (Milestone 2A)

## Goals

- A chat core that can be reused by future Windows, iOS and macOS front-ends.
- Deterministic tests that don't need a running model.
- Swift 6 strict concurrency with no global mutable state.
- Incremental migration from the Node.js agent, without rewriting it.

## Module graph

```text
               ┌──────────────┐
               │  PersonalAI  │  CLI: I/O, commands, friendly errors, env config
               └──────┬───────┘
                      │
               ┌──────▼───────┐
               │  AgentCore   │  ChatSession (actor) + AgentEngine (struct)
               └──┬────────┬──┘
                  │        │
       ┌──────────▼──┐  ┌──▼───────────┐
       │ AIProviders │  │  ChatDomain  │
       │ (protocol + │──▶ (value types │
       │  Ollama)    │  │  + errors)   │
       └─────────────┘  └──────────────┘
```

Only `AIProviders` touches networking, and only the `PersonalAI` executable touches the
console or environment. The core modules import only Foundation, so they have no
dependencies on SwiftUI, AppKit, UIKit, Combine or Core Data.

## Responsibilities

| Type | Kind | Responsibility |
|------|------|----------------|
| `MessageRole`, `ChatMessage`, `Conversation` | value types | Immutable messages; append-only history with identity. `Codable` so persistence can be added later. |
| `ModelConfiguration`, `AIRequest`, `AIResponse`, `TokenUsage` | value types | Provider-agnostic request and response. Says nothing about HTTP or streaming. |
| `AIServiceError` | enum | Typed provider failures: configuration, connection, timeout, HTTP status, model not found, model error, decoding, empty response, cancelled. |
| `AIProvider` | protocol | `generate(_:) async throws(AIServiceError) -> AIResponse`. Must honour task cancellation. |
| `OllamaProvider` | struct | Encodes `POST /api/chat` (`stream: false`), decodes replies, and maps transport and HTTP errors. Also has `checkAvailability()` for a fast reachability probe. |
| `HTTPTransport` / `URLSessionTransport` | protocol / struct | A small seam over `URLSession`, so tests can inject canned responses. |
| `ChatSession` | actor | Owns one conversation, enforces a single in-flight turn, commits history atomically, and handles cancellation. |
| `AgentEngine` | struct | Builds context (system prompt and history window), calls the provider, validates the reply, and returns an `AgentReply`. Stateless, so one engine can serve many sessions. |
| `ProfileMemory`, `JSONValue` | value types | Validated string facts plus lossless preservation of unknown JSON fields. |
| `MemoryStore` | protocol | Async persistence seam used by the CLI and injectable tests. |
| `JSONFileMemoryStore` | actor | Injected-path JSON persistence, serialized updates, one-time backup, and atomic replacement. |
| `MessageRouter` | struct | Pure deterministic recognition of explicit English/Tanglish memory declarations. |
| `ContextBuilder` | struct | Escapes and delimits validated facts as untrusted request context. |

## Profile-memory flow

```text
CLI input -> MessageRouter
  save route -> MemoryStore.update -> "Saved."
  chat route -> MemoryStore.load -> AgentEngine.send(profile snapshot) -> AIProvider
```

`AgentEngine` never receives a store or path and performs no filesystem work. It receives
an immutable `ProfileMemory` snapshot and uses the injected pure `MemoryContextBuilding`
protocol. Empty memory leaves existing requests unchanged.

The JSON file remains compatible with the Node agent's root object. Unknown string and
non-string values round-trip through `JSONValue`; only keys and strings passing current
validation are displayed or sent to the model. Existing files are copied to the adjacent
`.backup` path before their first mutation. A malformed file causes a typed error and is
never replaced.

## Key decision: the turn protocol (actor reentrancy)

Swift actors are **reentrant**. While a method is suspended at `await`, other callers
can run on the same actor. A naive implementation is broken:

```swift
// ❌ Broken: a second send() can interleave at the await
func send(_ text: String) async throws {
    messages.append(.user(text))
    let reply = try await provider.generate(...)   // suspension point
    messages.append(.assistant(reply.content))
}
```

`ChatSession` instead exposes **synchronous** actor methods. None of them contain an
`await`, so each one runs atomically:

```text
AgentEngine.send(text, in: session)
  1. session.beginTurn(text)          → claims the single "active turn" slot or throws .requestInProgress
  2. engine builds AIRequest           (outside the actor)
  3. provider.generate(request)        (outside the actor; can be slow)
  4a. success → session.completeTurn   → appends user + assistant together, frees slot
  4b. failure → session.failTurn       → records lastFailure, frees slot, history untouched
```

Consequences:

- **No overlapping generations per session.** A second `send` gets `.requestInProgress`
  immediately. Different sessions run fully in parallel.
- **Failures never corrupt history.** The user message is only committed together with a
  successful reply, so a retry never duplicates it.
- **Trade-off:** while a reply is pending, the user message isn't in `session.messages`
  yet. It's available as `PendingTurn.userMessage`. A UI can show it as "sending" from
  there.

## Cancellation

There are two ways to cancel a turn:

1. **Cancel the caller's task**, e.g. `task.cancel()` from a SwiftUI `.task` or a CLI
   signal handler. `AgentEngine` forwards this through `withTaskCancellationHandler`.
2. **Call `session.cancelActiveTurn()`**, e.g. from a Stop button that doesn't own the
   task. The engine registers a cancellation handler with the session for each turn.

`URLSession` honours cancellation, and `OllamaProvider` also checks `Task.isCancelled`
after the response arrives. If a provider finishes anyway, `completeTurn` rejects the
cancelled turn, so a late reply is never stored. The session stays busy until the engine
calls `failTurn`, which stops a new turn from racing an old request that is still
unwinding.

**Outcome rules (Milestone 1.1):**

- **Result matches history.** A successful `send` means exactly one user/assistant
  pair was committed. A thrown error means nothing was committed. A 200-iteration
  timing test checks this under racing cancellation.
- **Cancelled turns report `.cancelled`.** If the provider later returns an empty reply
  or fails with a different error, `failTurn` still records and returns `.cancelled`.
- **Cancellation is checked before the reply is validated.**
- **Accepted window:** a caller-task cancellation that arrives after the engine's last
  `Task.isCancelled` check, during the hop into `completeTurn`, is treated as
  "too late". The reply is committed *and* returned, so the outcome is still
  consistent. `session.cancelActiveTurn()` has no such window, because its flag is
  checked inside the actor, atomically with the commit.

## Other decisions and trade-offs

- **Typed throws** (`throws(AIServiceError)`, `throws(AgentError)`): callers can
  `switch` exhaustively over the errors. `Task` erases typed errors, so the engine maps
  the error back after awaiting the generation task.
- **Three library modules, not four.** `ChatSession` and `AgentEngine` share
  `AgentCore`. A module named `ChatSession` containing an actor named `ChatSession`
  makes the module name unusable for qualifying types, which causes known name-shadowing
  problems.
- **The system prompt isn't stored in history.** It's prepended per request, so changing
  the prompt doesn't rewrite stored conversations.
- **Context window:** `maxContextMessages` (default 40) drops the oldest history first
  and never splits a turn. After taking the newest `limit` messages, any leading
  non-user messages are dropped, so an odd limit rounds down to whole pairs. `nil` sends
  everything; `0` or a negative value sends no history, only the new message. The
  system prompt doesn't count toward the limit. The limit counts messages, not tokens;
  token-aware trimming is future work.
- **No force unwraps for URLs:** `OllamaProvider(baseURLString:)` validates the URL and
  throws `.invalidConfiguration`.
- **Windows connection behaviour (investigated in Milestone 1.1):**
  1. **Refused connections aren't detected.** When nothing listens on `127.0.0.1`,
     `URLSession` (swift-corelibs-foundation, Swift 6.4.2) waits for the whole request
     timeout and reports `.timedOut`. Plain `curl` gets "connection refused" in about
     2 s. `[::1]` is refused instantly.
  2. **Init-parameter timeouts are ignored.** `URLRequest(url:cachePolicy:timeoutInterval:)`
     drops its timeout and the session default (60 s) applies, even though the property
     reads back the right value. In Milestone 1 this silently capped the 3 s probe *and*
     the 120 s generation timeout at 60 s. The fix: `OllamaProvider.urlRequest(url:timeout:)`
     always assigns the property. A unit test can't detect this; it was verified live (a
     75 s generation against a slow local server succeeded, and the probe now fails in
     3 s).
  3. **Request-time strategy.** Before each chat, `OllamaProvider` sends a
     `GET /api/version` probe (`availabilityTimeout`, default 3 s). Only an unreachable
     result (`.connectionFailed`) or cancellation stops the request; other probe results
     let it proceed. If a chat times out, it re-probes: an unreachable server becomes
     `.connectionFailed`, otherwise the error stays `.timedOut` (slow model). With Ollama
     stopped, a message now fails in about 3 s instead of the full timeout. When Ollama is
     up, the cost is one extra localhost round trip per message. `availabilityTimeout: nil`
     disables probing.
- **Streaming readiness:** `AIRequest` is transport-agnostic, and history is committed
  only once per turn. To add streaming, add a provider requirement such as
  `stream(_:) -> AsyncThrowingStream<AIResponseChunk, Error>` (with a default
  implementation built on `generate`) and an engine method that yields chunks, then call
  `completeTurn` with the accumulated text. The turn protocol doesn't change.

## Testing strategy

| Suite | Seam | Covers |
|-------|------|--------|
| `ChatDomainTests` | — | Message creation, roles, history order, value semantics, Codable round-trips |
| `AIProvidersTests` | `StubTransport` (per-endpoint outcomes) | Request encoding, success decoding, malformed JSON, missing message, empty content, model error payload, HTTP 404/500/503, connection refused, timeout, `URLError.cancelled`, task cancellation, invalid URLs/models, availability probe, pre-flight and post-timeout classification |
| `AgentCoreTests` | `MockProvider` actor, `CancelCallerThenReplyProvider` | Multi-turn context, history commits, system prompt handling, context trimming (zero/odd/negative limits), session isolation, provider failures, retry without duplication, empty replies, overlap rejection, parallel sessions, caller and session cancellation, cancellation right before commit, result/history agreement |

The mock provider can suspend until released, which makes the concurrency tests
deterministic: the test waits until the provider has the request, then makes its
assertions.

## Known limitations

- Conversations are in memory only and are lost when the process exits.
- Responses are not streamed; the CLI prints the full reply when it is ready.
- The context window counts messages, not tokens.
- The CLI cannot cancel a running request with Ctrl+C; Ctrl+C exits the process.
- If Ollama stops *during* a generation, Windows still waits the full chat timeout
  (120 s) before the post-timeout probe reports it unreachable.
- It's unverified whether `URLSession` on Windows aborts the socket when a task is
  cancelled. The provider discards the result either way, but the session stays busy
  until the request returns.
- The Windows `URLSession` behaviours above were observed with Swift 6.4.2 and may
  change in later toolchains.
- Notes and forex tools still exist only in Node.js.
- Apple platforms (`.macOS(.v14)`, `.iOS(.v17)`) are declared in `Package.swift` but
  **have not been built or tested**. Only Windows x64 with Swift 6.4.2 has been verified.

## Later migration path

Keep the Node agent as the reference implementation while later milestones add streaming,
a tool protocol, notes, forex research, and finally native UI shells reusing `AgentCore`.
Conversation persistence and cloud/profile synchronization remain explicitly out of scope.
