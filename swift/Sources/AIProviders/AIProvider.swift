import ChatDomain

/// Abstraction over any large-language-model backend.
///
/// Conformers must:
/// - Throw only `AIServiceError` (typed throws), mapping transport/decoding errors.
/// - Honour Swift task cancellation and throw `.cancelled` when cancelled.
///
/// Streaming can be added later as a second requirement (for example
/// `func stream(_:) -> AsyncThrowingStream<AIResponseChunk, Error>`) with a default
/// implementation built on `generate`, without changing existing callers.
public protocol AIProvider: Sendable {
    /// A short human-readable name, e.g. "Ollama".
    var name: String { get }

    /// Generates one complete reply for the given conversation context.
    func generate(_ request: AIRequest) async throws(AIServiceError) -> AIResponse
}
