import ChatDomain
import Foundation

/// The structured result of one successful agent turn.
public struct AgentReply: Sendable, Equatable {
    public let sessionID: UUID
    /// The assistant message that was committed to the session history.
    public let message: ChatMessage
    public let model: String
    public let finishReason: String?
    public let usage: TokenUsage?

    public var text: String { message.content }
}
