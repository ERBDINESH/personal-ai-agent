import Foundation

/// What the user typed at the prompt.
enum CLICommand: Equatable {
    case exit
    case newConversation
    case help
    case empty
    case message(String)

    init(input: String) {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        switch trimmed.lowercased() {
        case "": self = .empty
        case "exit", "quit", "/exit", "/quit": self = .exit
        case "/new", "new": self = .newConversation
        case "/help", "help": self = .help
        default: self = .message(trimmed)
        }
    }

    static let helpText = """
        Commands:
          /new   Start a new conversation (forgets this session's messages)
          /help  Show this help
          exit   Quit
        """
}
