import Foundation

public enum ProfileMemoryValidationError: Error, Sendable, Equatable, CustomStringConvertible {
    case invalidKey
    case invalidValue

    public var description: String {
        switch self {
        case .invalidKey:
            "Keys must start with a letter and contain at most 64 letters, numbers, dots, dashes, or underscores."
        case .invalidValue:
            "Values must be 1...500 characters and cannot contain control characters."
        }
    }
}

/// Persistent profile data compatible with the Node agent's flat JSON object.
///
/// All JSON fields are retained for round-tripping. Only valid string fields are
/// exposed as facts and included in model context.
public struct ProfileMemory: Codable, Sendable, Equatable {
    public static let empty = ProfileMemory()

    private var values: [String: JSONValue]

    public init(values: [String: JSONValue] = [:]) {
        self.values = values
    }

    public init(facts: [String: String]) throws(ProfileMemoryValidationError) {
        var values: [String: JSONValue] = [:]
        for (key, value) in facts {
            try Self.validate(key: key, value: value)
            values[key] = .string(value)
        }
        self.values = values
    }

    public var isEmpty: Bool { facts.isEmpty }

    /// Validated string facts suitable for display and model context.
    public var facts: [String: String] {
        values.reduce(into: [:]) { result, entry in
            guard let value = entry.value.stringValue,
                  Self.isValid(key: entry.key, value: value)
            else { return }
            result[entry.key] = value
        }
    }

    /// The complete JSON object, including unknown or non-string fields.
    public var rawValues: [String: JSONValue] { values }

    public subscript(key: String) -> String? { facts[key] }

    public mutating func set(_ value: String, forKey key: String) throws(ProfileMemoryValidationError) {
        try Self.validate(key: key, value: value)
        values[key] = .string(value)
    }

    @discardableResult
    public mutating func removeValue(forKey key: String) -> Bool {
        values.removeValue(forKey: key) != nil
    }

    public static func validate(key: String, value: String) throws(ProfileMemoryValidationError) {
        guard isValidKey(key) else { throw .invalidKey }
        guard isValidValue(value) else { throw .invalidValue }
    }

    public static func isValid(key: String, value: String) -> Bool {
        isValidKey(key) && isValidValue(value)
    }

    public static func isValidKey(_ key: String) -> Bool {
        guard (1...64).contains(key.count),
              key.first?.isLetter == true
        else { return false }
        return key.allSatisfy { $0.isLetter || $0.isNumber || ".-_".contains($0) }
    }

    public static func isValidValue(_ value: String) -> Bool {
        guard (1...500).contains(value.count),
              value == value.trimmingCharacters(in: .whitespacesAndNewlines)
        else { return false }
        return value.unicodeScalars.allSatisfy { scalar in
            !CharacterSet.controlCharacters.contains(scalar)
        }
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        values = try container.decode([String: JSONValue].self)
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(values)
    }
}
