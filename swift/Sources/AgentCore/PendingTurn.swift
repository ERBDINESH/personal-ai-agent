import ChatDomain
import Foundation

/// A user turn that has been accepted by a `ChatSession` but not yet committed.
///
/// The user message is *not* in the session history yet. It is committed
/// together with the assistant reply in `ChatSession.completeTurn`, so a failed
/// or cancelled request leaves the history exactly as it was.
public struct PendingTurn: Sendable, Equatable {
    public let id: UUID
    public let sessionID: UUID
    public let userMessage: ChatMessage
    /// Committed history at the time the turn began (excluding `userMessage`).
    public let history: [ChatMessage]

    /// History followed by the pending user message: what the model should see.
    public var context: [ChatMessage] { history + [userMessage] }
}
