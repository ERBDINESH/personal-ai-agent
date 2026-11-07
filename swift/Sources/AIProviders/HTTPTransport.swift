import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// The minimal HTTP surface `OllamaProvider` needs.
///
/// Injecting this (instead of using `URLSession` directly) lets tests feed
/// canned responses, malformed JSON and network errors without a server.
public protocol HTTPTransport: Sendable {
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

/// Errors produced by the transport layer itself (not by the server).
public enum HTTPTransportError: Error, Sendable, Equatable {
    case nonHTTPResponse
}

/// Production transport backed by Foundation's `URLSession`.
public struct URLSessionTransport: HTTPTransport {
    private let session: URLSession

    public init(session: URLSession = .shared) {
        self.session = session
    }

    public func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw HTTPTransportError.nonHTTPResponse
        }
        return (data, httpResponse)
    }
}
