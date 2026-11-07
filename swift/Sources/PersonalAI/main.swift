import AIProviders
import AgentCore
import AgentMemory
import ChatDomain
import Foundation

// Configuration comes from the environment so no machine-specific values live in code.
//   PERSONAL_AI_MODEL   model name (default: qwen2.5:3b)
//   OLLAMA_BASE_URL     server root (default: http://127.0.0.1:11434)
let environment = ProcessInfo.processInfo.environment
let modelName = environment["PERSONAL_AI_MODEL"].flatMap { $0.isEmpty ? nil : $0 } ?? ModelConfiguration.defaultModel
let baseURLString = environment["OLLAMA_BASE_URL"].flatMap { $0.isEmpty ? nil : $0 } ?? OllamaProvider.defaultBaseURLString
let memoryPath = environment["PERSONAL_AI_MEMORY_PATH"].flatMap { $0.isEmpty ? nil : $0 } ?? "../memory/profile.json"
let memoryURL = URL(fileURLWithPath: memoryPath, relativeTo: URL(fileURLWithPath: FileManager.default.currentDirectoryPath))
    .standardizedFileURL
let memoryStore = JSONFileMemoryStore(fileURL: memoryURL)
let messageRouter = MessageRouter()

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
Console.line("Memory: \(memoryURL.path)")
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
    case .memoryList:
        do {
            let memory = try await memoryStore.load()
            if memory.facts.isEmpty {
                Console.line("No profile facts saved.")
            } else {
                for (key, value) in memory.facts.sorted(by: { $0.key < $1.key }) {
                    Console.line("\(key): \(value)")
                }
            }
        } catch {
            Console.line("AI: [memory error] \(error)")
        }
        Console.line()
    case .memoryDelete(let key):
        do {
            guard ProfileMemory.isValidKey(key) else {
                throw ProfileMemoryValidationError.invalidKey
            }
            let before = try await memoryStore.load()
            _ = try await memoryStore.remove(key: key)
            Console.line(before.rawValues[key] == nil ? "No fact named '\(key)' was saved." : "Deleted '\(key)'.")
        } catch {
            Console.line("AI: [memory error] \(error)")
        }
        Console.line()
    case .message(let text):
        switch messageRouter.route(text) {
        case .saveMemory(let key, let value):
            do {
                _ = try await memoryStore.update(key: key, value: value)
                Console.line("AI: Saved.")
            } catch {
                Console.line("AI: [memory error] \(error)")
            }
        case .invalidMemory(let error):
            Console.line("AI: I couldn't save that memory. \(error)")
        case .chat:
            do {
                let memory = try await memoryStore.load()
                let reply = try await engine.send(text, in: session, profileMemory: memory)
                Console.line("AI: \(reply.text)")
            } catch let error as MemoryStoreError {
                Console.line("AI: [memory error] \(error)")
            } catch let error as AgentError {
                Console.line("AI: [error] \(ErrorMessages.describe(error, model: modelName, endpoint: baseURLString))")
            } catch {
                Console.line("AI: [error] \(error)")
            }
        }
        Console.line()
    }
}

Console.line("Goodbye!")
