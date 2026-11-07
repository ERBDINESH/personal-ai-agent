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
}

/// Deterministic `HTTPTransport` that never touches the network.
struct StubTransport: HTTPTransport {
    enum Outcome: Sendable {
        case response(status: Int, body: String)
        case failure(URLError.Code)
        /// Suspends until the surrounding task is cancelled.
        case hangUntilCancelled
    }

    let outcome: Outcome
    let recorder = RequestRecorder()

    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        await recorder.record(request)
        switch outcome {
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
