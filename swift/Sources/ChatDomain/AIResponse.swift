/// Token accounting reported by the provider, when available.
public struct TokenUsage: Sendable, Equatable {
    public var promptTokens: Int?
    public var completionTokens: Int?

    public init(promptTokens: Int? = nil, completionTokens: Int? = nil) {
        self.promptTokens = promptTokens
        self.completionTokens = completionTokens
    }
}

/// A complete (non-streamed) reply from a provider.
public struct AIResponse: Sendable, Equatable {
    public var content: String
    public var model: String
    public var finishReason: String?
    public var usage: TokenUsage?

    public init(content: String, model: String, finishReason: String? = nil, usage: TokenUsage? = nil) {
        self.content = content
        self.model = model
        self.finishReason = finishReason
        self.usage = usage
    }
}
