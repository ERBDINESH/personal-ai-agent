import Foundation

/// An ordered, append-only history of messages with a stable identity.
///
/// `Conversation` is a value type: copies never share mutable state, so two
/// sessions can never accidentally write into each other's history.
public struct Conversation: Codable, Sendable, Equatable, Identifiable {
    public let id: UUID
    public let createdAt: Date
    public private(set) var messages: [ChatMessage]

    public init(id: UUID = UUID(), createdAt: Date = Date(), messages: [ChatMessage] = []) {
        self.id = id
        self.createdAt = createdAt
        self.messages = messages
    }

    public var isEmpty: Bool { messages.isEmpty }

    public mutating func append(_ message: ChatMessage) {
        messages.append(message)
    }

    public mutating func append(contentsOf newMessages: [ChatMessage]) {
        messages.append(contentsOf: newMessages)
    }
}
