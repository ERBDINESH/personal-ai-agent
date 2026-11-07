/// Typed failures raised by `ChatSession` itself (not by the model).
public enum ChatSessionError: Error, Sendable, Equatable {
    /// The user message was empty or whitespace only.
    case emptyMessage
    /// Another turn is still in flight in this session.
    case requestInProgress
    /// The turn being completed/failed is not the session's active turn.
    case staleTurn
    /// The active turn was cancelled, so its result is discarded.
    case cancelled
}
