import Foundation

/// What the user typed at the prompt.
enum CLICommand: Equatable {
    case exit
    case newConversation
    case help
    case memoryList
    case memoryDelete(String)
    case empty
    case message(String)

    init(input: String) {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        let lowercased = trimmed.lowercased()
        switch lowercased {
        case "": self = .empty
        case "exit", "quit", "/exit", "/quit": self = .exit
        case "/new", "new": self = .newConversation
        case "/help", "help": self = .help
        case "/memory", "/memory list": self = .memoryList
        default:
            if lowercased.hasPrefix("/memory delete ") {
                self = .memoryDelete(String(trimmed.dropFirst("/memory delete ".count)))
            } else {
                self = .message(trimmed)
            }
        }
    }

    static let helpText = """
        Commands:
          /new   Start a new conversation (forgets this session's messages)
          /memory                         List saved profile facts
          /memory set <key> <value>       Save an explicit profile fact
          /memory delete <key>            Delete one profile fact
          /help  Show this help
          exit   Quit
        """
}
