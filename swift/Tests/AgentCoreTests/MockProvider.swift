import AIProviders
import AgentCore
import ChatDomain
import Testing

/// Scriptable, deterministic `AIProvider`. Each call consumes the next behaviour.
actor MockProvider: AIProvider {
    enum Behavior: Sendable {
        case reply(String)
        case fail(AIServiceError)
        /// Suspends until `release()` is called, then replies.
        case replyAfterRelease(String)
        /// Suspends until `release()` is called, then throws.
        case failAfterRelease(AIServiceError)
        /// Suspends until the calling task is cancelled, then throws `.cancelled`.
        case hangUntilCancelled
    }

    nonisolated let name = "Mock"
    private var behaviors: [Behavior]
    private(set) var requests: [AIRequest] = []
    private var gate: CheckedContinuation<Void, Never>?

    init(_ behaviors: [Behavior] = []) {
        self.behaviors = behaviors
    }

    var requestCount: Int { requests.count }

    func generate(_ request: AIRequest) async throws(AIServiceError) -> AIResponse {
        requests.append(request)
        let behavior = behaviors.isEmpty ? .reply("ok") : behaviors.removeFirst()

        switch behavior {
        case .reply(let text):
            return AIResponse(content: text, model: "mock-model", finishReason: "stop")
        case .fail(let error):
            throw error
        case .replyAfterRelease(let text):
            await withCheckedContinuation { gate = $0 }
            return AIResponse(content: text, model: "mock-model")
        case .failAfterRelease(let error):
            await withCheckedContinuation { gate = $0 }
            throw error
        case .hangUntilCancelled:
            do {
                try await Task.sleep(for: .seconds(3600))
            } catch {
                throw .cancelled
            }
            throw .timedOut
        }
    }

    func release() {
        gate?.resume()
        gate = nil
    }
}

/// Polls `condition` until it is true (bounded, so a bug fails instead of hanging).
func waitUntil(_ condition: @Sendable () async -> Bool) async {
    for _ in 0..<2_000 {
        if await condition() { return }
        try? await Task.sleep(for: .milliseconds(1))
    }
    Issue.record("Timed out waiting for condition")
}

/// Sends and returns the typed error, or `nil` on success.
func sendError(_ engine: AgentEngine, _ text: String, in session: ChatSession) async -> AgentError? {
    do {
        _ = try await engine.send(text, in: session)
        return nil
    } catch {
        return error
    }
}
