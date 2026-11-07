import AgentMemory
import Foundation
import Testing

@Suite("JSONFileMemoryStore")
struct JSONFileMemoryStoreTests {
    @Test("A missing file loads as empty without creating data")
    func initialEmpty() async throws {
        try await withTemporaryProfile { url in
            let store = JSONFileMemoryStore(fileURL: url)
            let loaded = try await store.load()
            #expect(loaded == .empty)
            #expect(!FileManager.default.fileExists(atPath: url.path))
        }
    }

    @Test("Saves and reloads after store recreation")
    func persistence() async throws {
        try await withTemporaryProfile { url in
            let first = JSONFileMemoryStore(fileURL: url)
            _ = try await first.update(key: "preferredLanguage", value: "Tanglish")

            let recreated = JSONFileMemoryStore(fileURL: url)
            let loaded = try await recreated.load()
            #expect(loaded["preferredLanguage"] == "Tanglish")
        }
    }

    @Test("Updates an existing fact")
    func updateExisting() async throws {
        try await withTemporaryProfile { url in
            let store = JSONFileMemoryStore(fileURL: url)
            _ = try await store.update(key: "name", value: "Old")
            _ = try await store.update(key: "name", value: "New")
            let loaded = try await store.load()
            #expect(loaded["name"] == "New")
        }
    }

    @Test("Imported unknown keys are preserved and original data is backed up")
    func migrationAndBackup() async throws {
        try await withTemporaryProfile { url in
            let original = Data(#"{"name":"Dinesh","future":{"enabled":true}}"#.utf8)
            try original.write(to: url)
            let store = JSONFileMemoryStore(fileURL: url)

            let updated = try await store.update(key: "preferredLanguage", value: "Tanglish")

            #expect(updated.rawValues["future"] == .object(["enabled": .bool(true)]))
            let backup = try Data(contentsOf: store.backupURL)
            #expect(backup == original)
        }
    }

    @Test("Malformed JSON is reported and never overwritten")
    func malformedJSON() async throws {
        try await withTemporaryProfile { url in
            let malformed = Data("{not json".utf8)
            try malformed.write(to: url)
            let store = JSONFileMemoryStore(fileURL: url)

            await #expect(throws: MemoryStoreError.malformedJSON(path: url.path)) {
                _ = try await store.update(key: "name", value: "Dinesh")
            }
            let remaining = try Data(contentsOf: url)
            #expect(remaining == malformed)
        }
    }

    @Test("Concurrent updates through one store are serialized")
    func concurrentUpdates() async throws {
        try await withTemporaryProfile { url in
            let store = JSONFileMemoryStore(fileURL: url)
            try await withThrowingTaskGroup(of: Void.self) { group in
                for index in 0..<30 {
                    group.addTask {
                        _ = try await store.update(key: "fact\(index)", value: "value\(index)")
                    }
                }
                try await group.waitForAll()
            }

            let memory = try await store.load()
            #expect(memory.facts.count == 30)
            #expect(memory["fact0"] == "value0")
            #expect(memory["fact29"] == "value29")
        }
    }

    @Test("Write failures are surfaced and existing data remains intact")
    func writeFailure() async throws {
        try await withTemporaryProfile { url in
            let original = Data(#"{"name":"Dinesh"}"#.utf8)
            try original.write(to: url)
            let store = JSONFileMemoryStore(fileURL: url, fileSystem: FailingWriteFileSystem())

            await #expect(throws: (any Error).self) {
                _ = try await store.update(key: "name", value: "Changed")
            }
            let remaining = try Data(contentsOf: url)
            #expect(remaining == original)
        }
    }

    @Test("Configured profile files never leak into each other")
    func profileIsolation() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let profileA = JSONFileMemoryStore(fileURL: root.appendingPathComponent("a.json"))
        let profileB = JSONFileMemoryStore(fileURL: root.appendingPathComponent("b.json"))
        _ = try await profileA.update(key: "name", value: "A")
        _ = try await profileB.update(key: "name", value: "B")

        let loadedA = try await profileA.load()
        let loadedB = try await profileB.load()
        #expect(loadedA["name"] == "A")
        #expect(loadedB["name"] == "B")
    }
}

private func withTemporaryProfile(
    _ body: (URL) async throws -> Void
) async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: root) }
    try await body(root.appendingPathComponent("profile.json"))
}

private struct FailingWriteFileSystem: MemoryFileSystem {
    func fileExists(at url: URL) -> Bool { FileManager.default.fileExists(atPath: url.path) }
    func read(from url: URL) throws -> Data { try Data(contentsOf: url) }
    func createDirectory(at url: URL) throws {
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    }
    func copyItem(at source: URL, to destination: URL) throws {
        try FileManager.default.copyItem(at: source, to: destination)
    }
    func writeAtomically(_ data: Data, to url: URL) throws { throw TestWriteError() }
}

private struct TestWriteError: Error {}
