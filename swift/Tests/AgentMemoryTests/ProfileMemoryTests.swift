import AgentMemory
import Foundation
import Testing

@Suite("ProfileMemory")
struct ProfileMemoryTests {
    @Test("Starts empty and reports missing facts")
    func emptyMemory() {
        let memory = ProfileMemory()
        #expect(memory.isEmpty)
        #expect(memory["preferredLanguage"] == nil)
    }

    @Test("Validates keys and values")
    func validation() throws {
        var memory = ProfileMemory()
        try memory.set("Tanglish", forKey: "preferredLanguage")
        #expect(memory["preferredLanguage"] == "Tanglish")

        #expect(throws: ProfileMemoryValidationError.invalidKey) {
            try memory.set("value", forKey: "bad key")
        }
        #expect(throws: ProfileMemoryValidationError.invalidValue) {
            try memory.set("line\nbreak", forKey: "name")
        }
    }

    @Test("Unknown JSON fields survive decoding, updates, and encoding")
    func preservesUnknownFields() throws {
        let source = Data(#"{"name":"Dinesh","future":{"enabled":true},"version":2}"#.utf8)
        var memory = try JSONDecoder().decode(ProfileMemory.self, from: source)
        try memory.set("Tanglish", forKey: "preferredLanguage")

        let roundTrip = try JSONDecoder().decode(
            ProfileMemory.self,
            from: JSONEncoder().encode(memory)
        )

        #expect(roundTrip["name"] == "Dinesh")
        #expect(roundTrip["preferredLanguage"] == "Tanglish")
        #expect(roundTrip.rawValues["future"] == .object(["enabled": .bool(true)]))
        #expect(roundTrip.rawValues["version"] == .number(2))
    }

    @Test("JSON numbers retain base-10 precision beyond Double")
    func preservesNumericPrecision() throws {
        let source = Data(#"{"largeInteger":9007199254740993,"preciseDecimal":1234567890.123456789012345678}"#.utf8)
        var memory = try JSONDecoder().decode(ProfileMemory.self, from: source)
        try memory.set("Tanglish", forKey: "preferredLanguage")

        let encoded = try JSONEncoder().encode(memory)
        let encodedText = try #require(String(data: encoded, encoding: .utf8))
        let roundTrip = try JSONDecoder().decode(ProfileMemory.self, from: encoded)
        let expectedInteger = try #require(Decimal(string: "9007199254740993"))
        let expectedDecimal = try #require(Decimal(string: "1234567890.123456789012345678"))

        #expect(encodedText.contains("9007199254740993"))
        #expect(encodedText.contains("1234567890.123456789012345678"))
        #expect(roundTrip.rawValues["largeInteger"] == .number(expectedInteger))
        #expect(roundTrip.rawValues["preciseDecimal"] == .number(expectedDecimal))
    }
}
