import AgentCore
import ChatDomain

/// Friendly, actionable text for errors shown in the CLI.
enum ErrorMessages {
    static func describe(_ error: AgentError, model: String, endpoint: String) -> String {
        switch error {
        case .emptyMessage:
            return "Please type a message."
        case .requestInProgress:
            return "Still working on the previous message. Please wait."
        case .cancelled:
            return "Request cancelled. Nothing was added to the conversation."
        case .provider(let serviceError):
            return describe(serviceError, model: model, endpoint: endpoint)
        }
    }

    static func describe(_ error: AIServiceError, model: String, endpoint: String) -> String {
        switch error {
        case .invalidConfiguration(let detail):
            return "Configuration problem: \(detail)"
        case .connectionFailed:
            return "Could not reach Ollama at \(endpoint). Is it running? Start it with `ollama serve` (or open the Ollama app) and try again."
        case .timedOut:
            return "Ollama did not answer in time. The model may still be loading, or Ollama may not be running (start it with `ollama serve`)."
        case .httpStatus(let code, let message):
            return "Ollama returned HTTP \(code)" + (message.map { ": \($0)" } ?? ".")
        case .modelNotFound(let name):
            return "Model '\(name)' is not installed. Run `ollama pull \(name)` and try again."
        case .modelError(let message):
            return "The model reported an error: \(message)"
        case .decodingFailed:
            return "Received an unexpected response from Ollama. Check that \(endpoint) is an Ollama server."
        case .emptyResponse:
            return "The model returned an empty reply. Please try again."
        case .cancelled:
            return "Request cancelled."
        }
    }
}
