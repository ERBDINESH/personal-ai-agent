import AIProviders
import AgentCore
import ChatDomain
import Foundation

// Configuration comes from the environment so no machine-specific values live in code.
//   PERSONAL_AI_MODEL   model name (default: qwen2.5:3b)
//   OLLAMA_BASE_URL     server root (default: http://127.0.0.1:11434)
let environment = ProcessInfo.processInfo.environment
let modelName = environment["PERSONAL_AI_MODEL"].flatMap { $0.isEmpty ? nil : $0 } ?? ModelConfiguration.defaultModel
let baseURLString = environment["OLLAMA_BASE_URL"].flatMap { $0.isEmpty ? nil : $0 } ?? OllamaProvider.defaultBaseURLString

let provider: OllamaProvider
do {
    provider = try OllamaProvider(baseURLString: baseURLString)
} catch {
    Console.error(ErrorMessages.describe(error, model: modelName, endpoint: baseURLString))
    exit(1)
}

let engine = AgentEngine(provider: provider, configuration: ModelConfiguration(model: modelName))
var session = ChatSession()

Console.line("Personal AI — Swift Edition")
Console.line("Model: \(modelName)")
Console.line("Type /help for commands.")

do {
    let version = try await provider.checkAvailability()
    Console.line("Connected to Ollama \(version) at \(baseURLString).")
} catch {
    Console.line("Warning: \(ErrorMessages.describe(error, model: modelName, endpoint: baseURLString))")
}
Console.line()

chatLoop: while true {
    guard let input = Console.prompt("You: ") else {
        Console.line()
        break chatLoop
    }

    switch CLICommand(input: input) {
    case .empty:
        continue
    case .exit:
        break chatLoop
    case .help:
        Console.line(CLICommand.helpText)
        Console.line()
    case .newConversation:
        session = ChatSession()
        Console.line("Started a new conversation.")
        Console.line()
    case .message(let text):
        do {
            let reply = try await engine.send(text, in: session)
            Console.line("AI: \(reply.text)")
        } catch {
            Console.line("AI: [error] \(ErrorMessages.describe(error, model: modelName, endpoint: baseURLString))")
        }
        Console.line()
    }
}

Console.line("Goodbye!")
