/// Provider-agnostic generation settings sent with every request.
public struct ModelConfiguration: Sendable, Equatable {
    public static let defaultModel = "qwen2.5:3b"

    /// The model identifier, e.g. `qwen2.5:3b`.
    public var model: String
    /// Sampling temperature. `nil` lets the provider use its default.
    public var temperature: Double?

    public init(model: String = ModelConfiguration.defaultModel, temperature: Double? = nil) {
        self.model = model
        self.temperature = temperature
    }
}
