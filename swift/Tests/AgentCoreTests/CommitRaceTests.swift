import AIProviders
import AgentCore
import ChatDomain
import Foundation
import Testing

/// Holds the caller's task so a provider can cancel it at a precise moment.
final class CallerTaskBox: @unchecked Sendable {
    private let lock = NSLock()
    private var task: Task<AgentError?, Never>?

    func set(_ task: Task<AgentError?, Never>) { lock.withLock { self.task = task } }
    var current: Task<AgentError?, Never>? { lock.withLock { task } }
}

/// Cancels the caller's task and *then* returns a reply, without checking cancellation.
/// This deterministically reproduces "cancellation immediately before commit".
struct CancelCallerThenReplyProvider: AIProvider {
    let name = "CancelCallerThenReply"
    let box: CallerTaskBox
    let reply: String

    func generate(_ request: AIRequest) async throws(AIServiceError) -> AIResponse {
        while box.current == nil {
            try? await Task.sleep(for: .milliseconds(1))
        }
        box.current?.cancel()
        return AIResponse(content: reply, model: "mock-model")
    }
}

private func runCancelBeforeCommit(reply: String) async -> (AgentError?, ChatSession) {
    let box = CallerTaskBox()
    let engine = AgentEngine(provider: CancelCallerThenReplyProvider(box: box, reply: reply))
    let session = ChatSession()
    let task = Task { await sendError(engine, "question", in: session) }
    box.set(task)
    return (await task.value, session)
}

@Suite("Cancellation racing the commit")
struct CommitRaceTests {
    // MARK: Caller-task cancellation

    @Test("Caller cancelled just before commit: reply is not committed")
    func callerCancelBeforeCommit() async {
        let (error, session) = await runCancelBeforeCommit(reply: "valid reply")
        #expect(error == .cancelled)
        #expect(await session.messages.isEmpty)
        #expect(await session.isGenerating == false)
        #expect(await session.lastFailure == .cancelled)
    }

    @Test("Caller cancelled just before commit with an empty reply reports .cancelled")
    func callerCancelBeforeCommitEmptyReply() async {
        let (error, session) = await runCancelBeforeCommit(reply: "   ")
        #expect(error == .cancelled)
        #expect(await session.lastFailure == .cancelled)
        #expect(await session.messages.isEmpty)
    }

    @Test("Caller cancelled while provider ignores cancellation: late reply discarded")
    func callerCancelWhileGated() async {
        let provider = MockProvider([.replyAfterRelease("late")])
        let engine = AgentEngine(provider: provider)
        let session = ChatSession()

        let task = Task { await sendError(engine, "question", in: session) }
        await waitUntil { await provider.requestCount == 1 }
        task.cancel()
        await provider.release()

        #expect(await task.value == .cancelled)
        #expect(await session.messages.isEmpty)
        #expect(await session.isGenerating == false)
    }

    // MARK: Session cancellation

    @Test("Session cancelled, provider then returns an empty reply: reports .cancelled")
    func sessionCancelThenEmptyReply() async {
        let provider = MockProvider([.replyAfterRelease("  ")])
        let engine = AgentEngine(provider: provider)
        let session = ChatSession()

        let task = Task { await sendError(engine, "question", in: session) }
        await waitUntil { await provider.requestCount == 1 }
        await session.cancelActiveTurn()
        await provider.release()

        #expect(await task.value == .cancelled)
        #expect(await session.lastFailure == .cancelled)
        #expect(await session.isGenerating == false)
    }

    @Test("Session cancelled, provider then fails with another error: reports .cancelled")
    func sessionCancelThenProviderError() async {
        let provider = MockProvider([.failAfterRelease(.connectionFailed("reset"))])
        let engine = AgentEngine(provider: provider)
        let session = ChatSession()

        let task = Task { await sendError(engine, "question", in: session) }
        await waitUntil { await provider.requestCount == 1 }
        await session.cancelActiveTurn()
        await provider.release()

        #expect(await task.value == .cancelled)
        #expect(await session.lastFailure == .cancelled)
        #expect(await session.isGenerating == false)
    }

    @Test("Cancelling after a successful commit is a no-op and keeps the reply")
    func cancelAfterCommit() async throws {
        let engine = AgentEngine(provider: MockProvider([.reply("done")]))
        let session = ChatSession()

        let reply = try await engine.send("question", in: session)
        await session.cancelActiveTurn()

        #expect(reply.text == "done")
        #expect(await session.messages.map(\.content) == ["question", "done"])
        #expect(await session.isGenerating == false)
    }

    // MARK: Invariant under arbitrary timing

    /// Whatever the timing, the result and the history must agree:
    /// success ⇔ exactly one committed user/assistant pair; failure ⇔ empty history.
    @Test("Success and committed history always agree under racing cancellation")
    func outcomeHistoryInvariant() async {
        for iteration in 0..<200 {
            let provider = SleepyProvider(delayMicroseconds: (iteration * 37) % 400)
            let engine = AgentEngine(provider: provider)
            let session = ChatSession()

            let task = Task { () -> Bool in
                do {
                    _ = try await engine.send("q", in: session)
                    return true
                } catch {
                    return false
                }
            }
            try? await Task.sleep(for: .microseconds((iteration * 53) % 400))
            if iteration.isMultiple(of: 2) {
                task.cancel()
            } else {
                await session.cancelActiveTurn()
            }

            let succeeded = await task.value
            let history = await session.messages
            #expect(succeeded ? history.map(\.content) == ["q", "a"] : history.isEmpty, "iteration \(iteration)")
            #expect(await session.isGenerating == false, "iteration \(iteration)")
        }
    }
}

/// Replies after a short delay and deliberately ignores cancellation, like a
/// transport that completes a request even after it was cancelled.
struct SleepyProvider: AIProvider {
    let name = "Sleepy"
    let delayMicroseconds: Int

    func generate(_ request: AIRequest) async throws(AIServiceError) -> AIResponse {
        let deadline = ContinuousClock.now + .microseconds(delayMicroseconds)
        while ContinuousClock.now < deadline {
            await Task.yield()
        }
        return AIResponse(content: "a", model: "mock-model")
    }
}
