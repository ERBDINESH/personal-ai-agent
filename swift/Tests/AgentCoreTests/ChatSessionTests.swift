import AgentCore
import ChatDomain
import Foundation
import Testing

/// Direct tests of the turn protocol, independent of `AgentEngine`.
@Suite("ChatSession turn protocol")
struct ChatSessionTests {
    @Test("Session identity matches its conversation")
    func identity() async {
        let conversation = Conversation()
        let session = ChatSession(conversation: conversation)
        #expect(session.id == conversation.id)
        #expect(await session.conversation == conversation)
    }

    @Test("beginTurn does not add the user message to history")
    func beginDoesNotCommit() async throws {
        let session = ChatSession()
        let turn = try await session.beginTurn("hello")

        #expect(turn.sessionID == session.id)
        #expect(turn.context.map(\.content) == ["hello"])
        #expect(await session.messages.isEmpty)
        #expect(await session.isGenerating)
    }

    @Test("Only one turn can be active at a time")
    func singleActiveTurn() async throws {
        let session = ChatSession()
        let turn = try await session.beginTurn("one")

        await #expect(throws: ChatSessionError.requestInProgress) {
            _ = try await session.beginTurn("two")
        }

        try await session.completeTurn(turn, assistantContent: "reply")
        _ = try await session.beginTurn("two")
    }

    @Test("Completing a stale turn is rejected")
    func staleTurn() async throws {
        let sessionA = ChatSession()
        let sessionB = ChatSession()
        let turnFromA = try await sessionA.beginTurn("A")
        _ = try await sessionB.beginTurn("B")

        await #expect(throws: ChatSessionError.staleTurn) {
            try await sessionB.completeTurn(turnFromA, assistantContent: "wrong session")
        }
        #expect(await sessionB.messages.isEmpty)
    }

    @Test("A cancelled turn cannot be completed")
    func cancelledTurnCannotComplete() async throws {
        let session = ChatSession()
        let turn = try await session.beginTurn("question")
        await session.cancelActiveTurn()

        await #expect(throws: ChatSessionError.cancelled) {
            try await session.completeTurn(turn, assistantContent: "answer")
        }
        // Still busy until the owner acknowledges the failure.
        #expect(await session.isGenerating)
        await session.failTurn(turn, error: .cancelled)
        #expect(await session.isGenerating == false)
        #expect(await session.messages.isEmpty)
    }

    @Test("Cancellation handler registered after cancel runs immediately")
    func lateHandlerRunsImmediately() async throws {
        let session = ChatSession()
        let turn = try await session.beginTurn("question")
        await session.cancelActiveTurn()

        let flag = Flag()
        await session.setCancellationHandler(for: turn) { flag.set() }
        #expect(flag.isSet)
    }
}

/// Minimal thread-safe boolean for handler assertions.
final class Flag: @unchecked Sendable {
    private let lock = NSLock()
    private var value = false

    func set() { lock.withLock { value = true } }
    var isSet: Bool { lock.withLock { value } }
}
