/// The author of a message in a conversation.
///
/// Raw values match the role strings used by Ollama and most chat-completion APIs.
public enum MessageRole: String, Codable, Sendable, CaseIterable {
    case system
    case user
    case assistant
}
