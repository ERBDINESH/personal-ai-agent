import AIProviders
import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Records outgoing requests so tests can inspect them.
actor RequestRecorder {
    private(set) var requests: [URLRequest] = []

    func record(_ request: URLRequest) {
        requests.append(request)
    }

    var chatRequests: [URLRequest] { requests.filter { $0.url?.path.hasSuffix("/api/chat") == true } }
    var versionRequests: [URLRequest] { requests.filter { $0.url?.path.hasSuffix("/api/version") == true } }
}

/// Deterministic `HTTPTransport` that never touches the network.
/// `/api/version` and `/api/chat` can be scripted independently.
struct StubTransport: HTTPTransport {
    enum Outcome: Sendable {
        case response(status: Int, body: String)
        case failure(URLError.Code)
        /// Suspends until the surrounding task is cancelled.
        case hangUntilCancelled
    }

    static let versionBody = "{\"version\":\"0.0.0-test\"}"

    let chat: Outcome
    let version: Outcome
    let recorder = RequestRecorder()

    init(outcome chat: Outcome, version: Outcome = .response(status: 200, body: StubTransport.versionBody)) {
        self.chat = chat
        self.version = version
    }

    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        await recorder.record(request)
        let isVersion = request.url?.path.hasSuffix("/api/version") == true
        switch isVersion ? version : chat {
        case .response(let status, let body):
            guard
                let url = request.url,
                let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: nil)
            else {
                throw URLError(.badURL)
            }
            return (Data(body.utf8), response)
        case .failure(let code):
            throw URLError(code)
        case .hangUntilCancelled:
            try await Task.sleep(for: .seconds(3600))
            throw URLError(.timedOut)
        }
    }
}

extension StubTransport {
    static func ok(_ body: String) -> StubTransport {
        StubTransport(outcome: .response(status: 200, body: body))
    }
}
