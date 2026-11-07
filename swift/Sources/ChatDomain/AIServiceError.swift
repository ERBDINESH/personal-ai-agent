/// Typed failures surfaced by any `AIProvider`.
///
/// Associated values are plain strings / ints (not underlying `Error`s) so the
/// enum stays `Sendable` and `Equatable`, which keeps tests simple.
public enum AIServiceError: Error, Sendable, Equatable {
    /// The provider was configured with invalid values (bad URL, empty model name…).
    case invalidConfiguration(String)
    /// The server could not be reached (not running, refused, DNS, connection lost).
    case connectionFailed(String)
    /// The request exceeded its timeout.
    case timedOut
    /// The server answered with a non-2xx status code.
    case httpStatus(code: Int, message: String?)
    /// The requested model is not available on the server.
    case modelNotFound(String)
    /// The server returned an error payload describing a model failure.
    case modelError(String)
    /// The response body could not be decoded.
    case decodingFailed(String)
    /// The model returned no usable content.
    case emptyResponse
    /// The request was cancelled before it completed.
    case cancelled
}
