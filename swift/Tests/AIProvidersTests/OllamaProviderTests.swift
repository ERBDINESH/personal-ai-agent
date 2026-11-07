@testable import AIProviders
import ChatDomain
import Foundation
import Testing

private let sampleRequest = AIRequest(
    messages: [.system("Be brief."), .user("My favourite language is Swift."), .assistant("Nice!"), .user("What is it?")],
    configuration: ModelConfiguration(model: "qwen2.5:3b")
)

private let successBody = """
    {"model":"qwen2.5:3b","created_at":"2026-01-01T00:00:00Z",
     "message":{"role":"assistant","content":"  Swift.  "},
     "done":true,"done_reason":"stop","prompt_eval_count":42,"eval_count":3}
    """

/// Calls `generate` and returns the typed error, or `nil` if it succeeded.
private func capturedError(_ provider: OllamaProvider, _ request: AIRequest = sampleRequest) async -> AIServiceError? {
    do {
        _ = try await provider.generate(request)
        return nil
    } catch {
        return error
    }
}

@Suite("OllamaProvider request encoding")
struct OllamaRequestEncodingTests {
    @Test("POSTs non-streaming JSON with full context to /api/chat")
    func encodesRequest() async throws {
        let transport = StubTransport.ok(successBody)
        let provider = try OllamaProvider(transport: transport)
        _ = try await provider.generate(sampleRequest)

        let sent = try #require(await transport.recorder.requests.first)
        #expect(sent.httpMethod == "POST")
        #expect(sent.url?.absoluteString == "http://127.0.0.1:11434/api/chat")
        #expect(sent.value(forHTTPHeaderField: "Content-Type") == "application/json")

        let body = try #require(sent.httpBody)
        let json = try #require(try JSONSerialization.jsonObject(with: body) as? [String: Any])
        #expect(json["model"] as? String == "qwen2.5:3b")
        #expect(json["stream"] as? Bool == false)
        #expect(json["options"] == nil)

        let messages = try #require(json["messages"] as? [[String: String]])
        #expect(messages.map { $0["role"] } == ["system", "user", "assistant", "user"])
        #expect(messages.last?["content"] == "What is it?")
    }

    @Test("Includes temperature in options when configured")
    func encodesTemperature() async throws {
        let transport = StubTransport.ok(successBody)
        let provider = try OllamaProvider(transport: transport)
        var request = sampleRequest
        request.configuration.temperature = 0.2
        _ = try await provider.generate(request)

        let body = try #require(await transport.recorder.requests.first?.httpBody)
        let json = try #require(try JSONSerialization.jsonObject(with: body) as? [String: Any])
        let options = try #require(json["options"] as? [String: Any])
        #expect(options["temperature"] as? Double == 0.2)
    }

    @Test("Honours a custom base URL")
    func customBaseURL() throws {
        let provider = try OllamaProvider(baseURLString: "http://localhost:9999", transport: StubTransport.ok(successBody))
        #expect(provider.chatEndpoint.absoluteString == "http://localhost:9999/api/chat")
    }

    @Test("Rejects invalid base URLs", arguments: ["", "not a url", "ftp://example.com", "http://"])
    func invalidBaseURL(_ value: String) {
        #expect(throws: AIServiceError.self) {
            _ = try OllamaProvider(baseURLString: value, transport: StubTransport.ok(successBody))
        }
    }

    @Test("Rejects an empty model name without calling the server")
    func emptyModel() async throws {
        let transport = StubTransport.ok(successBody)
        let provider = try OllamaProvider(transport: transport)
        let request = AIRequest(messages: [.user("hi")], configuration: ModelConfiguration(model: "  "))

        #expect(await capturedError(provider, request) == .invalidConfiguration("Model name must not be empty."))
        #expect(await transport.recorder.requests.isEmpty)
    }
}

@Suite("OllamaProvider response handling")
struct OllamaResponseTests {
    @Test("Decodes a successful reply, trimming whitespace and reading usage")
    func decodesSuccess() async throws {
        let provider = try OllamaProvider(transport: StubTransport.ok(successBody))
        let response = try await provider.generate(sampleRequest)

        #expect(response.content == "Swift.")
        #expect(response.model == "qwen2.5:3b")
        #expect(response.finishReason == "stop")
        #expect(response.usage == TokenUsage(promptTokens: 42, completionTokens: 3))
    }

    @Test("Malformed JSON becomes .decodingFailed")
    func malformedJSON() async throws {
        let provider = try OllamaProvider(transport: StubTransport.ok("{\"message\": {\"role\": "))
        guard case .decodingFailed = await capturedError(provider) else {
            Issue.record("Expected .decodingFailed")
            return
        }
    }

    @Test("A body without a message becomes .decodingFailed")
    func missingMessage() async throws {
        let provider = try OllamaProvider(transport: StubTransport.ok("{\"model\":\"qwen2.5:3b\",\"done\":true}"))
        guard case .decodingFailed = await capturedError(provider) else {
            Issue.record("Expected .decodingFailed")
            return
        }
    }

    @Test("Empty content becomes .emptyResponse")
    func emptyContent() async throws {
        let body = "{\"message\":{\"role\":\"assistant\",\"content\":\"   \"},\"done\":true}"
        let provider = try OllamaProvider(transport: StubTransport.ok(body))
        #expect(await capturedError(provider) == .emptyResponse)
    }

    @Test("An error field in a 200 body becomes .modelError")
    func modelErrorPayload() async throws {
        let provider = try OllamaProvider(transport: StubTransport.ok("{\"error\":\"model crashed\"}"))
        #expect(await capturedError(provider) == .modelError("model crashed"))
    }

    @Test("HTTP 500 surfaces the status and server message")
    func http500() async throws {
        let transport = StubTransport(outcome: .response(status: 500, body: "{\"error\":\"out of memory\"}"))
        let provider = try OllamaProvider(transport: transport)
        #expect(await capturedError(provider) == .httpStatus(code: 500, message: "out of memory"))
    }

    @Test("HTTP error with a non-JSON body still surfaces the status")
    func httpNonJSON() async throws {
        let transport = StubTransport(outcome: .response(status: 503, body: "<html>busy</html>"))
        let provider = try OllamaProvider(transport: transport)
        #expect(await capturedError(provider) == .httpStatus(code: 503, message: nil))
    }

    @Test("HTTP 404 'model not found' becomes .modelNotFound")
    func modelNotFound() async throws {
        let transport = StubTransport(outcome: .response(status: 404, body: "{\"error\":\"model 'qwen2.5:3b' not found\"}"))
        let provider = try OllamaProvider(transport: transport)
        #expect(await capturedError(provider) == .modelNotFound("qwen2.5:3b"))
    }
}

@Suite("OllamaProvider availability check")
struct OllamaAvailabilityTests {
    @Test("Returns the server version via GET /api/version with a short timeout")
    func reachable() async throws {
        let transport = StubTransport.ok("{\"version\":\"0.12.0\"}")
        let provider = try OllamaProvider(transport: transport)

        #expect(try await provider.checkAvailability(timeout: 2) == "0.12.0")
        let sent = try #require(await transport.recorder.requests.first)
        #expect(sent.httpMethod == "GET")
        #expect(sent.url?.absoluteString == "http://127.0.0.1:11434/api/version")
        #expect(sent.timeoutInterval == 2)
    }

    @Test("A probe timeout is reported as .connectionFailed")
    func timeoutMeansUnreachable() async throws {
        let provider = try OllamaProvider(transport: StubTransport(outcome: .failure(.timedOut)))
        do {
            _ = try await provider.checkAvailability()
            Issue.record("Expected failure")
        } catch {
            guard case .connectionFailed = error else {
                Issue.record("Expected .connectionFailed, got \(error)")
                return
            }
        }
    }

    @Test("A non-Ollama server is reported as .decodingFailed")
    func unexpectedBody() async throws {
        let provider = try OllamaProvider(transport: StubTransport.ok("<html></html>"))
        do {
            _ = try await provider.checkAvailability()
            Issue.record("Expected failure")
        } catch {
            guard case .decodingFailed = error else {
                Issue.record("Expected .decodingFailed, got \(error)")
                return
            }
        }
    }
}

@Suite("OllamaProvider transport failures and cancellation")
struct OllamaTransportFailureTests {
    @Test("Connection refused becomes .connectionFailed")
    func connectionRefused() async throws {
        let provider = try OllamaProvider(transport: StubTransport(outcome: .failure(.cannotConnectToHost)))
        guard case .connectionFailed = await capturedError(provider) else {
            Issue.record("Expected .connectionFailed")
            return
        }
    }

    @Test("Timeout becomes .timedOut")
    func timeout() async throws {
        let provider = try OllamaProvider(transport: StubTransport(outcome: .failure(.timedOut)))
        #expect(await capturedError(provider) == .timedOut)
    }

    @Test("URLError.cancelled becomes .cancelled")
    func urlCancelled() async throws {
        let provider = try OllamaProvider(transport: StubTransport(outcome: .failure(.cancelled)))
        #expect(await capturedError(provider) == .cancelled)
    }

    @Test("Cancelling the calling task aborts an in-flight request")
    func taskCancellation() async throws {
        let transport = StubTransport(outcome: .hangUntilCancelled)
        let provider = try OllamaProvider(transport: transport)

        let task = Task { await capturedError(provider) }
        // Wait until the request has reached the transport, then cancel.
        for _ in 0..<2_000 where await transport.recorder.requests.isEmpty {
            try await Task.sleep(for: .milliseconds(1))
        }
        task.cancel()

        #expect(await task.value == .cancelled)
    }

    @Test("An already-cancelled task never hits the network")
    func preCancelled() async throws {
        let transport = StubTransport.ok(successBody)
        let provider = try OllamaProvider(transport: transport)

        let task = Task {
            withUnsafeCurrentTask { $0?.cancel() }
            return await capturedError(provider)
        }

        #expect(await task.value == .cancelled)
        #expect(await transport.recorder.requests.isEmpty)
    }
}
