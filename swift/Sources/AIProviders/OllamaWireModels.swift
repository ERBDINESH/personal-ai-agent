// Wire-format types for the Ollama `/api/chat` endpoint.
// Kept internal so the rest of the package only sees ChatDomain types.

struct OllamaChatRequest: Encodable {
    struct Options: Encodable {
        var temperature: Double?
    }

    var model: String
    var messages: [OllamaMessage]
    var stream: Bool
    var options: Options?
}

struct OllamaMessage: Codable, Equatable {
    var role: String
    var content: String
}

struct OllamaChatResponse: Decodable {
    var model: String?
    var message: OllamaMessage?
    var done: Bool?
    var doneReason: String?
    var promptEvalCount: Int?
    var evalCount: Int?
    var error: String?

    enum CodingKeys: String, CodingKey {
        case model, message, done, error
        case doneReason = "done_reason"
        case promptEvalCount = "prompt_eval_count"
        case evalCount = "eval_count"
    }
}

struct OllamaErrorBody: Decodable {
    var error: String
}

struct OllamaVersionResponse: Decodable {
    var version: String
}
