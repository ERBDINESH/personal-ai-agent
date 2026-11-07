import Foundation

/// A single immutable message in a conversation.
public struct ChatMessage: Codable, Sendable, Equatable, Identifiable {
    public let id: UUID
    public let role: MessageRole
    public let content: String
    public let createdAt: Date

    public init(id: UUID = UUID(), role: MessageRole, content: String, createdAt: Date = Date()) {
        self.id = id
        self.role = role
        self.content = content
        self.createdAt = createdAt
    }

    public static func system(_ content: String) -> ChatMessage {
        ChatMessage(role: .system, content: content)
    }

    public static func user(_ content: String) -> ChatMessage {
        ChatMessage(role: .user, content: content)
    }

    public static func assistant(_ content: String) -> ChatMessage {
        ChatMessage(role: .assistant, content: content)
    }
}
