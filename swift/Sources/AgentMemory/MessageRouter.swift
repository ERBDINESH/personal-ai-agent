import Foundation

public enum MessageRoute: Sendable, Equatable {
    case saveMemory(key: String, value: String)
    case invalidMemory(ProfileMemoryValidationError)
    case chat
}

/// Pure, deterministic routing for explicit profile declarations and commands.
public struct MessageRouter: Sendable {
    private struct Pattern: Sendable {
        let key: String
        let expression: String
    }

    private static let declarationPatterns = [
        Pattern(key: "preferredLanguage", expression: #"^my preferred language is\s+(.+)$"#),
        Pattern(key: "name", expression: #"^my name is\s+(.+)$"#),
        Pattern(key: "profession", expression: #"^my profession is\s+(.+)$"#),
        Pattern(key: "preferredLanguage", expression: #"^en preferred language(?: is)?\s+(.+)$"#),
        Pattern(key: "name", expression: #"^en peru\s+(.+)$"#),
        Pattern(key: "profession", expression: #"^i am an?\s+(.+\b(?:developer|engineer|designer|manager|teacher|doctor|student))\.?$"#),
        Pattern(key: "profession", expression: #"^naa\s+(.+\b(?:developer|engineer|designer|manager|teacher|doctor|student))\.?$"#),
    ]

    public init() {}

    public func route(_ message: String) -> MessageRoute {
        let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)

        if let explicit = capture(#"^/memory\s+set\s+([^\s=]+)(?:\s*=\s*|\s+)(.+)$"#, in: trimmed, groups: 2) {
            return validatedRoute(key: explicit[0], value: explicit[1])
        }

        for pattern in Self.declarationPatterns {
            if let match = capture(pattern.expression, in: trimmed, groups: 1)?.first {
                let value = match.trimmingCharacters(in: CharacterSet(charactersIn: ".!"))
                return validatedRoute(key: pattern.key, value: value)
            }
        }

        return .chat
    }

    private func validatedRoute(key: String, value: String) -> MessageRoute {
        let key = key.trimmingCharacters(in: .whitespacesAndNewlines)
        let value = value
            .replacingOccurrences(of: #"[\r\n]+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            try ProfileMemory.validate(key: key, value: value)
            return .saveMemory(key: key, value: value)
        } catch let error {
            return .invalidMemory(error)
        }
    }

    private func capture(_ pattern: String, in text: String, groups: Int) -> [String]? {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
              let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              match.range.location != NSNotFound
        else { return nil }

        return (1...groups).compactMap { index in
            guard let range = Range(match.range(at: index), in: text) else { return nil }
            return String(text[range])
        }
    }
}
