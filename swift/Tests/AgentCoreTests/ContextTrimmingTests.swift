import AIProviders
import AgentCore
import ChatDomain
import Testing

/// History with three committed turns: Q1 A1 Q2 A2 Q3 A3.
private func threeTurnSession() -> ChatSession {
    var conversation = Conversation()
    for index in 1...3 {
        conversation.append(contentsOf: [.user("Q\(index)"), .assistant("A\(index)")])
    }
    return ChatSession(conversation: conversation)
}

private func contextContents(limit: Int?) async throws -> [String] {
    let engine = AgentEngine(provider: MockProvider(), systemPrompt: nil, maxContextMessages: limit)
    let turn = try await threeTurnSession().beginTurn("NEW")
    return engine.makeRequest(for: turn).messages.map(\.content)
}

@Suite("Context trimming")
struct ContextTrimmingTests {
    @Test(
        "Keeps whole user/assistant pairs and never starts with an orphaned reply",
        arguments: [
            // limit, expected context sent to the model
            (6, ["Q1", "A1", "Q2", "A2", "Q3", "A3", "NEW"]),
            (100, ["Q1", "A1", "Q2", "A2", "Q3", "A3", "NEW"]),
            (5, ["Q2", "A2", "Q3", "A3", "NEW"]),
            (4, ["Q2", "A2", "Q3", "A3", "NEW"]),
            (3, ["Q3", "A3", "NEW"]),
            (2, ["Q3", "A3", "NEW"]),
            (1, ["NEW"]),
        ] as [(Int, [String])]
    )
    func pairsPreserved(limit: Int, expected: [String]) async throws {
        #expect(try await contextContents(limit: limit) == expected)
    }

    @Test("Zero limit sends only the new message", arguments: [0])
    func zeroLimit(limit: Int) async throws {
        #expect(try await contextContents(limit: limit) == ["NEW"])
    }

    @Test("Negative limits behave like zero", arguments: [-1, -2, Int.min])
    func negativeLimit(limit: Int) async throws {
        #expect(try await contextContents(limit: limit) == ["NEW"])
    }

    @Test("nil limit sends the full history")
    func noLimit() async throws {
        #expect(try await contextContents(limit: nil) == ["Q1", "A1", "Q2", "A2", "Q3", "A3", "NEW"])
    }

    @Test("Trimming never changes stored history")
    func storedHistoryUntouched() async throws {
        let session = threeTurnSession()
        let engine = AgentEngine(provider: MockProvider(), systemPrompt: nil, maxContextMessages: 1)
        let turn = try await session.beginTurn("NEW")
        _ = engine.makeRequest(for: turn)
        #expect(await session.messages.count == 6)
    }

    @Test("System prompt is always sent and does not count toward the limit")
    func systemPromptNotCounted() async throws {
        let engine = AgentEngine(provider: MockProvider(), systemPrompt: "SYS", maxContextMessages: 2)
        let turn = try await threeTurnSession().beginTurn("NEW")
        #expect(engine.makeRequest(for: turn).messages.map(\.content) == ["SYS", "Q3", "A3", "NEW"])
    }
}
