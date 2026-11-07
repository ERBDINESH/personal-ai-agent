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
    private let transport: any HTTPTransport

    /// - Parameters:
    ///   - baseURL: Server root, e.g. `http://127.0.0.1:11434`.
    ///   - timeout: Per-request timeout. Local models can be slow on first load, so the default is generous.
    ///   - transport: HTTP implementation; inject a fake in tests.
    public init(baseURL: URL, timeout: TimeInterval = 120, transport: any HTTPTransport = URLSessionTransport()) {
        self.chatEndpoint = baseURL.appendingPathComponent("api").appendingPathComponent("chat")
        self.versionEndpoint = baseURL.appendingPathComponent("api").appendingPathComponent("version")
        self.timeout = timeout
        self.transport = transport
    }

    /// Convenience initializer that validates a URL string instead of force-unwrapping it.
    public init(
        baseURLString: String = OllamaProvider.defaultBaseURLString,
        timeout: TimeInterval = 120,
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
        self.init(baseURL: url, timeout: timeout, transport: transport)
    }

    public func generate(_ request: AIRequest) async throws(AIServiceError) -> AIResponse {
        let urlRequest = try makeURLRequest(for: request)

        if Task.isCancelled { throw .cancelled }

        let data: Data
        let httpResponse: HTTPURLResponse
        do {
            (data, httpResponse) = try await transport.send(urlRequest)
        } catch {
            throw Self.mapTransportError(error)
        }

        // Some Foundation implementations complete the request even after the task
        // was cancelled; never hand back a result the caller has already abandoned.
        if Task.isCancelled { throw .cancelled }

        return try Self.parse(data: data, response: httpResponse, requestedModel: request.configuration.model)
    }

    /// Quick reachability check (`GET /api/version`) that returns the server version.
    ///
    /// On Windows, Foundation's `URLSession` does not fail fast when nothing is listening
    /// on the port; it waits for the full request timeout. Generation needs a long timeout,
    /// so callers use this short probe to detect a stopped server early. A timeout here is
    /// reported as `.connectionFailed`.
    public func checkAvailability(timeout probeTimeout: TimeInterval = 3) async throws(AIServiceError) -> String {
        var urlRequest = URLRequest(url: versionEndpoint, timeoutInterval: probeTimeout)
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

    // MARK: - Request building

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

        var urlRequest = URLRequest(url: chatEndpoint, timeoutInterval: timeout)
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
