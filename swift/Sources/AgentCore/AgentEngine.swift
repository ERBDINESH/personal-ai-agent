import AIProviders
import AgentMemory
import ChatDomain

/// Coordinates a `ChatSession` and an `AIProvider` for one turn at a time.
///
/// The engine is a stateless value: it holds configuration and a provider, but no
/// conversation data. The same engine can serve many independent sessions.
/// It contains no networking, persistence or UI code — those live behind
/// `AIProvider` and in the app layer.
public struct AgentEngine: Sendable {
    public static let defaultSystemPrompt = """
        You are a helpful personal AI assistant. Give clear and concise answers. \
        Use earlier messages in this conversation when they are relevant. \
        Do not invent facts about the user.
        """

    public let provider: any AIProvider
    public var configuration: ModelConfiguration
    /// Prepended to every request; never stored in session history.
    public var systemPrompt: String?
    /// Maximum committed history messages sent as context (oldest turns are dropped first,
    /// never splitting a user/assistant pair). `nil` sends the full history; `0` or a
    /// negative value sends none.
    public var maxContextMessages: Int?
    /// Pure formatter for optional profile memory. Persistence stays outside the engine.
    public var contextBuilder: any MemoryContextBuilding

    public init(
        provider: any AIProvider,
        configuration: ModelConfiguration = ModelConfiguration(),
        systemPrompt: String? = AgentEngine.defaultSystemPrompt,
        maxContextMessages: Int? = 40,
        contextBuilder: any MemoryContextBuilding = ContextBuilder()
    ) {
        self.provider = provider
        self.configuration = configuration
        self.systemPrompt = systemPrompt
        self.maxContextMessages = maxContextMessages
        self.contextBuilder = contextBuilder
    }

    /// Sends `text` as the next user turn in `session` and returns the committed reply.
    ///
    /// On any failure (including cancellation) the session history is unchanged and
    /// the session is free for a retry.
    public func send(
        _ text: String,
        in session: ChatSession,
        profileMemory: ProfileMemory = .empty
    ) async throws(AgentError) -> AgentReply {
        let turn: PendingTurn
        do {
            turn = try await session.beginTurn(text)
        } catch {
            throw AgentError(error)
        }

        let request = makeRequest(for: turn, profileMemory: profileMemory)
        let provider = self.provider

        // Run the model call in its own task so either the caller's task cancellation
        // or `session.cancelActiveTurn()` can abort it.
        let generation = Task { () async throws -> AIResponse in
            try await provider.generate(request)
        }
        await session.setCancellationHandler(for: turn) { generation.cancel() }

        let result = await withTaskCancellationHandler {
            await generation.result
        } onCancel: {
            generation.cancel()
        }

        let response: AIResponse
        switch result {
        case .success(let value):
            response = value
        case .failure(let error):
            // `Task` erases typed throws to `any Error`; restore the typed error.
            let serviceError = (error as? AIServiceError)
                ?? (error is CancellationError ? .cancelled : .modelError(String(describing: error)))
            let recorded = await session.failTurn(turn, error: Task.isCancelled ? .cancelled : serviceError)
            throw AgentError(recorded)
        }

        // Cancellation takes precedence over validating the reply.
        if Task.isCancelled {
            await session.failTurn(turn, error: .cancelled)
            throw .cancelled
        }

        let content = response.content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty else {
            let recorded = await session.failTurn(turn, error: .emptyResponse)
            throw AgentError(recorded)
        }

        do {
            let message = try await session.completeTurn(turn, assistantContent: content)
            return AgentReply(
                sessionID: session.id,
                message: message,
                model: response.model,
                finishReason: response.finishReason,
                usage: response.usage
            )
        } catch {
            await session.failTurn(turn, error: .cancelled)
            throw AgentError(error)
        }
    }

    /// Builds the provider request: optional system prompt + trimmed history + pending user message.
    public func makeRequest(
        for turn: PendingTurn,
        profileMemory: ProfileMemory = .empty
    ) -> AIRequest {
        let history = Self.trimmedHistory(turn.history, limit: maxContextMessages)

        var messages: [ChatMessage] = []
        if let prompt = contextBuilder.buildSystemPrompt(basePrompt: systemPrompt, memory: profileMemory),
           !prompt.isEmpty {
            messages.append(.system(prompt))
        }
        messages.append(contentsOf: history)
        messages.append(turn.userMessage)

        return AIRequest(messages: messages, configuration: configuration)
    }

    /// Keeps at most `limit` of the most recent messages without splitting a turn.
    ///
    /// - `nil`: full history.
    /// - `0` or negative: no history (only the new user message is sent).
    /// - Otherwise: the newest `limit` messages, then any leading non-user messages are
    ///   dropped so context always starts at a user message. An odd limit therefore
    ///   rounds down to whole user/assistant pairs.
    static func trimmedHistory(_ history: [ChatMessage], limit: Int?) -> [ChatMessage] {
        guard let limit else { return history }
        guard limit > 0 else { return [] }
        guard history.count > limit else { return history }

        var trimmed = history.suffix(limit)
        while let first = trimmed.first, first.role != .user {
            trimmed = trimmed.dropFirst()
        }
        return Array(trimmed)
    }
}
