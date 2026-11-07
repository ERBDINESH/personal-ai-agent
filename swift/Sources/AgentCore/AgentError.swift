import ChatDomain

/// Typed failures returned by `AgentEngine.send`.
public enum AgentError: Error, Sendable, Equatable {
    case emptyMessage
    case requestInProgress
    case cancelled
    case provider(AIServiceError)

    init(_ error: ChatSessionError) {
        switch error {
        case .emptyMessage: self = .emptyMessage
        case .requestInProgress: self = .requestInProgress
        case .cancelled, .staleTurn: self = .cancelled
        }
    }

    init(_ error: AIServiceError) {
        self = error == .cancelled ? .cancelled : .provider(error)
    }
}
