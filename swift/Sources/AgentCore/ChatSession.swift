import ChatDomain
import Foundation

/// Owns one conversation's state and enforces "one generation at a time".
///
/// ## Why a turn protocol instead of one big `send` method?
/// Actors are *reentrant*: while an actor method is suspended at an `await`,
/// other calls can run on the actor. A naive
/// `func send() async { messages.append(user); await model(); messages.append(reply) }`
/// lets a second `send` interleave at the `await`, producing tangled history.
///
/// `ChatSession` avoids that by never awaiting while holding a half-finished turn:
/// - `beginTurn` (synchronous on the actor) atomically checks and claims the
///   single "active turn" slot.
/// - The slow model call happens *outside* the actor (in `AgentEngine`).
/// - `completeTurn` / `failTurn` (also synchronous) commit or release the slot.
///
/// Because none of these methods contain an `await`, each runs atomically.
///
/// ## History guarantees
/// The user message and the assistant reply are appended together, only on
/// success. Failed or cancelled turns leave history untouched, so a retry
/// never duplicates the user message.
public actor ChatSession {
    public nonisolated let id: UUID
    public private(set) var conversation: Conversation
    /// The most recent failure, cleared by the next successful turn.
    public private(set) var lastFailure: AIServiceError?

    private var activeTurn: ActiveTurn?

    private struct ActiveTurn {
        let id: UUID
        var isCancelled = false
        var cancellationHandler: (@Sendable () -> Void)?
    }

    public init(conversation: Conversation = Conversation()) {
        self.id = conversation.id
        self.conversation = conversation
    }

    public var messages: [ChatMessage] { conversation.messages }

    /// `true` while a turn is in flight (including while a cancelled turn unwinds).
    public var isGenerating: Bool { activeTurn != nil }

    // MARK: - Turn lifecycle

    /// Claims the session for a new turn. Throws if another turn is active.
    public func beginTurn(_ text: String) throws(ChatSessionError) -> PendingTurn {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw .emptyMessage }
        guard activeTurn == nil else { throw .requestInProgress }

        let turnID = UUID()
        activeTurn = ActiveTurn(id: turnID)
        return PendingTurn(
            id: turnID,
            sessionID: id,
            userMessage: .user(trimmed),
            history: conversation.messages
        )
    }

    /// Registers how to abort the in-flight work for `turn`.
    /// If the turn was already cancelled, the handler runs immediately.
    public func setCancellationHandler(for turn: PendingTurn, _ handler: @escaping @Sendable () -> Void) {
        guard var current = activeTurn, current.id == turn.id else { return }
        if current.isCancelled {
            handler()
            return
        }
        current.cancellationHandler = handler
        activeTurn = current
    }

    /// Atomically commits the user message and the assistant reply, and frees the session.
    @discardableResult
    public func completeTurn(_ turn: PendingTurn, assistantContent: String) throws(ChatSessionError) -> ChatMessage {
        guard let current = activeTurn, current.id == turn.id else { throw .staleTurn }
        guard !current.isCancelled else { throw .cancelled }

        let reply = ChatMessage.assistant(assistantContent)
        conversation.append(contentsOf: [turn.userMessage, reply])
        lastFailure = nil
        activeTurn = nil
        return reply
    }

    /// Releases the session after a failed or cancelled turn without touching history.
    public func failTurn(_ turn: PendingTurn, error: AIServiceError) {
        guard let current = activeTurn, current.id == turn.id else { return }
        lastFailure = error
        activeTurn = nil
    }

    /// Cancels the in-flight turn, if any.
    ///
    /// The session stays busy until the engine observes the cancellation and calls
    /// `failTurn`, so a new turn cannot start while the old request is unwinding.
    public func cancelActiveTurn() {
        guard var current = activeTurn, !current.isCancelled else { return }
        current.isCancelled = true
        let handler = current.cancellationHandler
        current.cancellationHandler = nil
        activeTurn = current
        handler?()
    }
}
