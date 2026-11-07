import ChatDomain
import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// `AIProvider` implementation for a local Ollama server (`POST /api/chat`, non-streaming).
public struct OllamaProvider: AIProvider {
    public static let defaultBaseURLString = "http://127.0.0.1:11434"

    public let name = "Ollama"
    public let chatEndpoint: URL
    public let versionEndpoint: URL
    public let timeout: TimeInterval
    /// Timeout for the reachability probe sent before each chat. `nil` disables probing.
    public let availabilityTimeout: TimeInterval?
    private let transport: any HTTPTransport

    /// - Parameters:
    ///   - baseURL: Server root, e.g. `http://127.0.0.1:11434`.
    ///   - timeout: Chat request timeout. Local models can be slow on first load, so the default is generous.
    ///   - availabilityTimeout: Short timeout for the `GET /api/version` probe sent before each chat
    ///     (and after a chat timeout). On Windows a stopped server is otherwise only detected after
    ///     the full chat `timeout`. `nil` disables probing.
    ///   - transport: HTTP implementation; inject a fake in tests.
    public init(
        baseURL: URL,
        timeout: TimeInterval = 120,
        availabilityTimeout: TimeInterval? = 3,
        transport: any HTTPTransport = URLSessionTransport()
    ) {
        self.chatEndpoint = baseURL.appendingPathComponent("api").appendingPathComponent("chat")
        self.versionEndpoint = baseURL.appendingPathComponent("api").appendingPathComponent("version")
        self.timeout = timeout
        self.availabilityTimeout = availabilityTimeout
        self.transport = transport
    }

    /// Convenience initializer that validates a URL string instead of force-unwrapping it.
    public init(
        baseURLString: String = OllamaProvider.defaultBaseURLString,
        timeout: TimeInterval = 120,
        availabilityTimeout: TimeInterval? = 3,
        transport: any HTTPTransport = URLSessionTransport()
    ) throws(AIServiceError) {
        guard
            let url = URL(string: baseURLString),
            let scheme = url.scheme?.lowercased(),
            scheme == "http" || scheme == "https",
            url.host != nil
        else {
            throw .invalidConfiguration("Invalid Ollama base URL: \(baseURLString)")
        }
        self.init(baseURL: url, timeout: timeout, availabilityTimeout: availabilityTimeout, transport: transport)
    }

    public func generate(_ request: AIRequest) async throws(AIServiceError) -> AIResponse {
        let urlRequest = try makeURLRequest(for: request)

        if Task.isCancelled { throw .cancelled }

        try await ensureReachable()

        let data: Data
        let httpResponse: HTTPURLResponse
        do {
            (data, httpResponse) = try await transport.send(urlRequest)
        } catch {
            let mapped = Self.mapTransportError(error)
            throw mapped == .timedOut ? await classifyTimeout() : mapped
        }

        // Some Foundation implementations complete the request even after the task
        // was cancelled; never hand back a result the caller has already abandoned.
        if Task.isCancelled { throw .cancelled }

        return try Self.parse(data: data, response: httpResponse, requestedModel: request.configuration.model)
    }

    /// Quick reachability check (`GET /api/version`) that returns the server version.
    ///
    /// On Windows, Foundation's `URLSession` does not fail fast when nothing is listening
    /// on `127.0.0.1`; it waits for the full request timeout. Generation needs a long timeout,
    /// so this short probe detects a stopped server early. A timeout here is reported as
    /// `.connectionFailed`.
    public func checkAvailability(timeout probeTimeout: TimeInterval = 3) async throws(AIServiceError) -> String {
        var urlRequest = Self.urlRequest(url: versionEndpoint, timeout: probeTimeout)
        urlRequest.httpMethod = "GET"

        let data: Data
        let response: HTTPURLResponse
        do {
            (data, response) = try await transport.send(urlRequest)
        } catch {
            let mapped = Self.mapTransportError(error)
            throw mapped == .timedOut ? .connectionFailed("No response from \(versionEndpoint) within \(probeTimeout)s") : mapped
        }

        guard (200..<300).contains(response.statusCode) else {
            throw .httpStatus(code: response.statusCode, message: nil)
        }
        do {
            return try JSONDecoder().decode(OllamaVersionResponse.self, from: data).version
        } catch {
            throw .decodingFailed(String(describing: error))
        }
    }

    // MARK: - Availability strategy

    /// Fails fast only when the server is unreachable. Other probe outcomes (HTTP errors,
    /// unexpected bodies from proxies or old servers) let the chat request proceed.
    private func ensureReachable() async throws(AIServiceError) {
        guard let availabilityTimeout else { return }
        do {
            _ = try await checkAvailability(timeout: availabilityTimeout)
        } catch {
            switch error {
            case .connectionFailed, .cancelled:
                throw error
            default:
                return
            }
        }
    }

    /// After a chat timeout, distinguishes "server went away" from "model is slow".
    private func classifyTimeout() async -> AIServiceError {
        guard let availabilityTimeout else { return .timedOut }
        do {
            _ = try await checkAvailability(timeout: availabilityTimeout)
            return .timedOut
        } catch {
            switch error {
            case .connectionFailed, .cancelled:
                return error
            default:
                return .timedOut
            }
        }
    }

    // MARK: - Request building

    /// Builds a request whose timeout is honoured on every platform.
    ///
    /// swift-corelibs-foundation on Windows (verified with Swift 6.4.2) ignores the value
    /// passed to `URLRequest(url:cachePolicy:timeoutInterval:)` and falls back to the
    /// session default (60 s), even though the property reads back correctly. Assigning
    /// the property explicitly is honoured.
    static func urlRequest(url: URL, timeout: TimeInterval) -> URLRequest {
        var request = URLRequest(url: url)
        request.timeoutInterval = timeout
        return request
    }

    func makeURLRequest(for request: AIRequest) throws(AIServiceError) -> URLRequest {
        let model = request.configuration.model.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !model.isEmpty else {
            throw .invalidConfiguration("Model name must not be empty.")
        }

        let body = OllamaChatRequest(
            model: model,
            messages: request.messages.map { OllamaMessage(role: $0.role.rawValue, content: $0.content) },
            stream: false,
            options: request.configuration.temperature.map { OllamaChatRequest.Options(temperature: $0) }
        )

        var urlRequest = Self.urlRequest(url: chatEndpoint, timeout: timeout)
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        urlRequest.setValue("application/json", forHTTPHeaderField: "Accept")
        do {
            urlRequest.httpBody = try JSONEncoder().encode(body)
        } catch {
            throw .invalidConfiguration("Could not encode request: \(error)")
        }
        return urlRequest
    }

    // MARK: - Response parsing

    static func parse(data: Data, response: HTTPURLResponse, requestedModel: String) throws(AIServiceError) -> AIResponse {
        let decoder = JSONDecoder()

        guard (200..<300).contains(response.statusCode) else {
            let serverMessage = (try? decoder.decode(OllamaErrorBody.self, from: data))?.error
            if response.statusCode == 404, let serverMessage,
               serverMessage.lowercased().contains("not found") {
                throw .modelNotFound(requestedModel)
            }
            throw .httpStatus(code: response.statusCode, message: serverMessage)
        }

        let decoded: OllamaChatResponse
        do {
            decoded = try decoder.decode(OllamaChatResponse.self, from: data)
        } catch {
            throw .decodingFailed(String(describing: error))
        }

        if let serverError = decoded.error {
            throw .modelError(serverError)
        }

        guard let message = decoded.message else {
            throw .decodingFailed("Response did not contain a 'message' object.")
        }

        let content = message.content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty else {
            throw .emptyResponse
        }

        var usage: TokenUsage?
        if decoded.promptEvalCount != nil || decoded.evalCount != nil {
            usage = TokenUsage(promptTokens: decoded.promptEvalCount, completionTokens: decoded.evalCount)
        }

        return AIResponse(
            content: content,
            model: decoded.model ?? requestedModel,
            finishReason: decoded.doneReason,
            usage: usage
        )
    }

    // MARK: - Error mapping

    static func mapTransportError(_ error: any Error) -> AIServiceError {
        if error is CancellationError {
            return .cancelled
        }
        if let urlError = error as? URLError {
            switch urlError.code {
            case .cancelled:
                return .cancelled
            case .timedOut:
                return .timedOut
            default:
                return .connectionFailed("URL error \(urlError.code.rawValue): \(urlError.localizedDescription)")
            }
        }
        if let transportError = error as? HTTPTransportError, transportError == .nonHTTPResponse {
            return .decodingFailed("Server response was not an HTTP response.")
        }
        return .connectionFailed(String(describing: error))
    }
}
