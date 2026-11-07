/// Everything a provider needs to generate one reply.
///
/// The request is transport-agnostic: it says nothing about streaming or HTTP,
/// so a future streaming API can accept the same value.
public struct AIRequest: Sendable, Equatable {
    public var messages: [ChatMessage]
    public var configuration: ModelConfiguration

    public init(messages: [ChatMessage], configuration: ModelConfiguration = ModelConfiguration()) {
        self.messages = messages
        self.configuration = configuration
    }
}
