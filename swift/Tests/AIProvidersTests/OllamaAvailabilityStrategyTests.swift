@testable import AIProviders
import ChatDomain
import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import Testing

private let request = AIRequest(messages: [.user("hi")])
private let chatOK = StubTransport.Outcome.response(
    status: 200,
    body: "{\"model\":\"qwen2.5:3b\",\"message\":{\"role\":\"assistant\",\"content\":\"hello\"},\"done\":true}"
)

private func capturedError(_ provider: OllamaProvider) async -> AIServiceError? {
    do {
        _ = try await provider.generate(request)
        return nil
    } catch {
        return error
    }
}

@Suite("OllamaProvider request-time availability strategy")
struct OllamaAvailabilityStrategyTests {
    @Test("Each chat is preceded by a short reachability probe")
    func probesBeforeChat() async throws {
        let transport = StubTransport(outcome: chatOK)
        let provider = try OllamaProvider(timeout: 120, availabilityTimeout: 3, transport: transport)

        _ = try await provider.generate(request)

        let paths = await transport.recorder.requests.map { $0.url?.path ?? "" }
        #expect(paths == ["/api/version", "/api/chat"])
        #expect(await transport.recorder.versionRequests.first?.timeoutInterval == 3)
        #expect(await transport.recorder.chatRequests.first?.timeoutInterval == 120)
    }

    @Test("Unreachable server (Windows: probe times out) fails fast without sending the chat")
    func unreachableFailsFast() async throws {
        let transport = StubTransport(outcome: .hangUntilCancelled, version: .failure(.timedOut))
        let provider = try OllamaProvider(transport: transport)

        guard case .connectionFailed = await capturedError(provider) else {
            Issue.record("Expected .connectionFailed")
            return
        }
        #expect(await transport.recorder.chatRequests.isEmpty)
    }

    @Test("Connection refused during the probe fails fast without sending the chat")
    func refusedFailsFast() async throws {
        let transport = StubTransport(outcome: .hangUntilCancelled, version: .failure(.cannotConnectToHost))
        let provider = try OllamaProvider(transport: transport)

        guard case .connectionFailed = await capturedError(provider) else {
            Issue.record("Expected .connectionFailed")
            return
        }
        #expect(await transport.recorder.chatRequests.isEmpty)
    }

    @Test(
        "Probe oddities other than unreachability do not block generation",
        arguments: [
            StubTransport.Outcome.response(status: 404, body: "404 page not found"),
            StubTransport.Outcome.response(status: 200, body: "<html></html>"),
        ]
    )
    func probeOdditiesIgnored(version: StubTransport.Outcome) async throws {
        let provider = try OllamaProvider(transport: StubTransport(outcome: chatOK, version: version))
        #expect(try await provider.generate(request).content == "hello")
    }

    @Test("Slow generation that times out while the server is up stays .timedOut")
    func slowModelStaysTimedOut() async throws {
        let transport = StubTransport(outcome: .failure(.timedOut))
        let provider = try OllamaProvider(transport: transport)

        #expect(await capturedError(provider) == .timedOut)
        #expect(await transport.recorder.versionRequests.count == 2)
    }

    @Test("Chat timeout with the server now unreachable becomes .connectionFailed")
    func timeoutThenServerGone() async throws {
        let transport = SequencedVersionTransport()
        let provider = try OllamaProvider(transport: transport)

        guard case .connectionFailed = await capturedError(provider) else {
            Issue.record("Expected .connectionFailed")
            return
        }
    }

    @Test("availabilityTimeout nil disables probing entirely")
    func probingDisabled() async throws {
        let transport = StubTransport(outcome: .failure(.timedOut), version: .failure(.timedOut))
        let provider = try OllamaProvider(availabilityTimeout: nil, transport: transport)

        #expect(await capturedError(provider) == .timedOut)
        #expect(await transport.recorder.versionRequests.isEmpty)
    }

    @Test("Cancellation during the probe is reported as .cancelled and skips the chat")
    func cancelDuringProbe() async throws {
        let transport = StubTransport(outcome: chatOK, version: .hangUntilCancelled)
        let provider = try OllamaProvider(transport: transport)

        let task = Task { await capturedError(provider) }
        for _ in 0..<2_000 where await transport.recorder.versionRequests.isEmpty {
            try await Task.sleep(for: .milliseconds(1))
        }
        task.cancel()

        #expect(await task.value == .cancelled)
        #expect(await transport.recorder.chatRequests.isEmpty)
    }
}

/// First probe succeeds, chat times out, second probe finds the server gone.
private actor SequencedVersionTransport: HTTPTransport {
    private var versionCalls = 0

    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        guard let url = request.url else { throw URLError(.badURL) }
        if url.path.hasSuffix("/api/version") {
            versionCalls += 1
            if versionCalls > 1 { throw URLError(.timedOut) }
            guard let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil) else {
                throw URLError(.badServerResponse)
            }
            return (Data(StubTransport.versionBody.utf8), response)
        }
        throw URLError(.timedOut)
    }
}
