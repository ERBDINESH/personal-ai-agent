import AIProviders
import AgentCore
import ChatDomain
import Testing

@Suite("AgentEngine conversation flow")
struct AgentEngineConversationTests {
    @Test("Sends full multi-turn context to the provider")
    func multiTurnContext() async throws {
        let provider = MockProvider([.reply("Nice choice!"), .reply("Swift.")])
        let engine = AgentEngine(provider: provider, systemPrompt: "SYSTEM")
        let session = ChatSession()

        _ = try await engine.send("My favourite programming language is Swift.", in: session)
        let reply = try await engine.send("What is my favourite programming language?", in: session)

        #expect(reply.text == "Swift.")
        #expect(reply.sessionID == session.id)
        #expect(reply.model == "mock-model")

        let second = try #require(await provider.requests.last)
        #expect(second.messages.map(\.role) == [.system, .user, .assistant, .user])
        #expect(second.messages.map(\.content) == [
            "SYSTEM",
            "My favourite programming language is Swift.",
            "Nice choice!",
            "What is my favourite programming language?",
        ])
        #expect(second.configuration.model == "qwen2.5:3b")
    }

    @Test("Commits user and assistant messages in order")
    func commitsHistory() async throws {
        let engine = AgentEngine(provider: MockProvider([.reply("  A1  "), .reply("A2")]))
        let session = ChatSession()

        let first = try await engine.send("  Q1 ", in: session)
        _ = try await engine.send("Q2", in: session)

        let history = await session.messages
        #expect(history.map(\.content) == ["Q1", "A1", "Q2", "A2"])
        #expect(history.map(\.role) == [.user, .assistant, .user, .assistant])
        #expect(history[1] == first.message)
        #expect(await session.isGenerating == false)
    }

    @Test("System prompt is sent but never stored in history")
    func systemPromptNotStored() async throws {
        let engine = AgentEngine(provider: MockProvider(), systemPrompt: "SYSTEM")
        let session = ChatSession()
        _ = try await engine.send("hi", in: session)
        #expect(await session.messages.allSatisfy { $0.role != .system })
    }

    @Test("No system message is sent when the prompt is nil")
    func noSystemPrompt() async throws {
        let provider = MockProvider()
        let engine = AgentEngine(provider: provider, systemPrompt: nil)
        _ = try await engine.send("hi", in: ChatSession())
        #expect(await provider.requests.first?.messages.map(\.role) == [.user])
    }

    @Test("Context window keeps only the most recent history")
    func contextLimit() async throws {
        let provider = MockProvider([.reply("A1"), .reply("A2"), .reply("A3")])
        let engine = AgentEngine(provider: provider, systemPrompt: nil, maxContextMessages: 2)
        let session = ChatSession()

        _ = try await engine.send("Q1", in: session)
        _ = try await engine.send("Q2", in: session)
        _ = try await engine.send("Q3", in: session)

        #expect(await provider.requests.last?.messages.map(\.content) == ["Q2", "A2", "Q3"])
        #expect(await session.messages.count == 6)
    }
}

@Suite("Session isolation")
struct SessionIsolationTests {
    @Test("Sessions sharing one engine never see each other's messages")
    func isolation() async throws {
        let provider = MockProvider([.reply("A-reply"), .reply("B-reply")])
        let engine = AgentEngine(provider: provider, systemPrompt: nil)
        let sessionA = ChatSession()
        let sessionB = ChatSession()

        _ = try await engine.send("Secret for A", in: sessionA)
        _ = try await engine.send("Hello from B", in: sessionB)

        #expect(sessionA.id != sessionB.id)
        #expect(await provider.requests.last?.messages.map(\.content) == ["Hello from B"])
        #expect(await sessionA.messages.map(\.content) == ["Secret for A", "A-reply"])
        #expect(await sessionB.messages.map(\.content) == ["Hello from B", "B-reply"])
    }

    @Test("A new session starts with empty history")
    func newSessionIsEmpty() async throws {
        let engine = AgentEngine(provider: MockProvider())
        let old = ChatSession()
        _ = try await engine.send("remember me", in: old)

        let fresh = ChatSession()
        #expect(await fresh.messages.isEmpty)
        #expect(fresh.id != old.id)
    }
}

@Suite("Failure handling")
struct FailureHandlingTests {
    @Test("Provider failure leaves history untouched and frees the session")
    func failureDoesNotCorruptHistory() async throws {
        let engine = AgentEngine(provider: MockProvider([.fail(.connectionFailed("refused"))]))
        let session = ChatSession()

        #expect(await sendError(engine, "hello", in: session) == .provider(.connectionFailed("refused")))
        #expect(await session.messages.isEmpty)
        #expect(await session.isGenerating == false)
        #expect(await session.lastFailure == .connectionFailed("refused"))
    }

    @Test("Retry after failure does not duplicate the user message")
    func retryWithoutDuplication() async throws {
        let provider = MockProvider([.reply("A1"), .fail(.httpStatus(code: 500, message: nil)), .reply("A2")])
        let engine = AgentEngine(provider: provider, systemPrompt: nil)
        let session = ChatSession()

        _ = try await engine.send("Q1", in: session)
        #expect(await sendError(engine, "Q2", in: session) == .provider(.httpStatus(code: 500, message: nil)))
        #expect(await session.messages.map(\.content) == ["Q1", "A1"])

        _ = try await engine.send("Q2", in: session)

        #expect(await provider.requests.last?.messages.map(\.content) == ["Q1", "A1", "Q2"])
        #expect(await session.messages.map(\.content) == ["Q1", "A1", "Q2", "A2"])
        #expect(await session.lastFailure == nil)
    }

    @Test("Whitespace-only replies are rejected, not persisted")
    func emptyReplyNotPersisted() async throws {
        let engine = AgentEngine(provider: MockProvider([.reply("   \n ")]))
        let session = ChatSession()

        #expect(await sendError(engine, "hi", in: session) == .provider(.emptyResponse))
        #expect(await session.messages.isEmpty)
        #expect(await session.isGenerating == false)
    }

    @Test("Empty user messages are rejected before calling the provider")
    func emptyUserMessage() async throws {
        let provider = MockProvider()
        let engine = AgentEngine(provider: provider)
        let session = ChatSession()

        #expect(await sendError(engine, "   ", in: session) == .emptyMessage)
        #expect(await provider.requestCount == 0)
        #expect(await session.isGenerating == false)
    }
}

@Suite("Concurrency and cancellation")
struct ConcurrencyTests {
    @Test("Overlapping sends in one session are rejected while the first is suspended")
    func rejectsOverlap() async throws {
        let provider = MockProvider([.replyAfterRelease("first reply")])
        let engine = AgentEngine(provider: provider, systemPrompt: nil)
        let session = ChatSession()

        let first = Task { try await engine.send("first", in: session) }
        await waitUntil { await provider.requestCount == 1 }

        #expect(await session.isGenerating)
        #expect(await sendError(engine, "second", in: session) == .requestInProgress)

        await provider.release()
        let reply = try await first.value

        #expect(reply.text == "first reply")
        #expect(await provider.requestCount == 1)
        #expect(await session.messages.map(\.content) == ["first", "first reply"])
    }

    @Test("Different sessions can generate concurrently")
    func parallelSessions() async throws {
        let provider = MockProvider([.replyAfterRelease("A"), .replyAfterRelease("B")])
        let engine = AgentEngine(provider: provider, systemPrompt: nil)
        let sessionA = ChatSession()
        let sessionB = ChatSession()

        let taskA = Task { try await engine.send("to A", in: sessionA) }
        await waitUntil { await provider.requestCount == 1 }
        let taskB = Task { try await engine.send("to B", in: sessionB) }
        await provider.release()
        await waitUntil { await provider.requestCount == 2 }
        await provider.release()

        let replies = try await [taskA.value.text, taskB.value.text]
        #expect(Set(replies) == ["A", "B"])
        #expect(await sessionA.messages.count == 2)
        #expect(await sessionB.messages.count == 2)
    }

    @Test("Cancelling the caller's task cancels generation without touching history")
    func callerCancellation() async throws {
        let provider = MockProvider([.hangUntilCancelled, .reply("after retry")])
        let engine = AgentEngine(provider: provider, systemPrompt: nil)
        let session = ChatSession()

        let task = Task { await sendError(engine, "slow question", in: session) }
        await waitUntil { await provider.requestCount == 1 }
        task.cancel()

        #expect(await task.value == .cancelled)
        #expect(await session.messages.isEmpty)
        #expect(await session.isGenerating == false)
        #expect(await session.lastFailure == .cancelled)

        let retry = try await engine.send("slow question", in: session)
        #expect(retry.text == "after retry")
        #expect(await session.messages.map(\.content) == ["slow question", "after retry"])
    }

    @Test("session.cancelActiveTurn() aborts in-flight generation")
    func sessionCancellation() async throws {
        let provider = MockProvider([.hangUntilCancelled])
        let engine = AgentEngine(provider: provider)
        let session = ChatSession()

        let task = Task { await sendError(engine, "slow", in: session) }
        await waitUntil { await provider.requestCount == 1 }
        await session.cancelActiveTurn()

        #expect(await task.value == .cancelled)
        #expect(await session.messages.isEmpty)
        #expect(await session.isGenerating == false)
    }

    @Test("A reply arriving after session cancellation is discarded")
    func lateReplyDiscarded() async throws {
        let provider = MockProvider([.replyAfterRelease("too late")])
        let engine = AgentEngine(provider: provider)
        let session = ChatSession()

        let task = Task { await sendError(engine, "question", in: session) }
        await waitUntil { await provider.requestCount == 1 }
        // The mock ignores cancellation while gated, simulating a provider that finishes anyway.
        await session.cancelActiveTurn()
        await provider.release()

        #expect(await task.value == .cancelled)
        #expect(await session.messages.isEmpty)
        #expect(await session.isGenerating == false)
    }
}
