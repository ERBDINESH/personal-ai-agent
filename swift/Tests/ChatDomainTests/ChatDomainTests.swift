import ChatDomain
import Foundation
import Testing

@Suite("ChatMessage")
struct ChatMessageTests {
    @Test("Factory methods set the expected role and content")
    func factories() {
        #expect(ChatMessage.user("hi").role == .user)
        #expect(ChatMessage.assistant("hello").role == .assistant)
        #expect(ChatMessage.system("rules").role == .system)
        #expect(ChatMessage.user("hi").content == "hi")
    }

    @Test("Each message gets a unique identity")
    func uniqueIDs() {
        #expect(ChatMessage.user("same").id != ChatMessage.user("same").id)
    }

    @Test("Role raw values match the chat API wire format")
    func roleRawValues() {
        #expect(MessageRole.allCases.map(\.rawValue) == ["system", "user", "assistant"])
    }

    @Test("Round-trips through JSON")
    func codable() throws {
        let original = ChatMessage(role: .assistant, content: "Swift.")
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(ChatMessage.self, from: data)
        #expect(decoded == original)
    }
}

@Suite("Conversation")
struct ConversationTests {
    @Test("Starts empty with a stable identity")
    func startsEmpty() {
        let conversation = Conversation()
        #expect(conversation.isEmpty)
        #expect(conversation.messages.isEmpty)
        #expect(Conversation().id != conversation.id)
    }

    @Test("Appends messages in order")
    func appendsInOrder() {
        var conversation = Conversation()
        conversation.append(.user("one"))
        conversation.append(contentsOf: [.assistant("two"), .user("three")])
        #expect(conversation.messages.map(\.content) == ["one", "two", "three"])
        #expect(conversation.messages.map(\.role) == [.user, .assistant, .user])
    }

    @Test("Copies are independent (value semantics)")
    func valueSemantics() {
        var first = Conversation()
        first.append(.user("shared"))
        var second = first
        second.append(.assistant("only in second"))
        #expect(first.messages.count == 1)
        #expect(second.messages.count == 2)
    }

    @Test("Round-trips through JSON")
    func codable() throws {
        var conversation = Conversation()
        conversation.append(contentsOf: [.user("Q"), .assistant("A")])
        let data = try JSONEncoder().encode(conversation)
        let decoded = try JSONDecoder().decode(Conversation.self, from: data)
        #expect(decoded == conversation)
    }
}

@Suite("Requests and configuration")
struct RequestTests {
    @Test("Default model is qwen2.5:3b")
    func defaultModel() {
        #expect(ModelConfiguration().model == "qwen2.5:3b")
        #expect(AIRequest(messages: []).configuration.model == "qwen2.5:3b")
    }
}
