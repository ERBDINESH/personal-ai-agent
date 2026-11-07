import Foundation

public enum MemoryStoreError: Error, Sendable, Equatable, CustomStringConvertible {
    case malformedJSON(path: String)
    case readFailed(path: String, message: String)
    case backupFailed(path: String, message: String)
    case writeFailed(path: String, message: String)

    public var description: String {
        switch self {
        case .malformedJSON(let path):
            "Memory at \(path) is not a valid JSON object. The file was left unchanged."
        case .readFailed(let path, let message):
            "Could not read memory at \(path): \(message)"
        case .backupFailed(let path, let message):
            "Could not back up existing memory at \(path): \(message)"
        case .writeFailed(let path, let message):
            "Could not save memory at \(path): \(message)"
        }
    }
}

public protocol MemoryFileSystem: Sendable {
    func fileExists(at url: URL) -> Bool
    func read(from url: URL) throws -> Data
    func createDirectory(at url: URL) throws
    func copyItem(at source: URL, to destination: URL) throws
    func writeAtomically(_ data: Data, to url: URL) throws
}

public struct FoundationMemoryFileSystem: MemoryFileSystem {
    public init() {}

    public func fileExists(at url: URL) -> Bool {
        FileManager.default.fileExists(atPath: url.path)
    }

    public func read(from url: URL) throws -> Data { try Data(contentsOf: url) }

    public func createDirectory(at url: URL) throws {
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    }

    public func copyItem(at source: URL, to destination: URL) throws {
        try FileManager.default.copyItem(at: source, to: destination)
    }

    public func writeAtomically(_ data: Data, to url: URL) throws {
        try data.write(to: url, options: .atomic)
    }
}

/// Actor-isolated JSON persistence with atomic writes and a one-time import backup.
public actor JSONFileMemoryStore: MemoryStore {
    public nonisolated let fileURL: URL
    public nonisolated var backupURL: URL {
        fileURL.appendingPathExtension("backup")
    }

    private let fileSystem: any MemoryFileSystem
    private var backupPrepared = false

    public init(fileURL: URL, fileSystem: any MemoryFileSystem = FoundationMemoryFileSystem()) {
        self.fileURL = fileURL.standardizedFileURL
        self.fileSystem = fileSystem
    }

    public func load() throws -> ProfileMemory {
        guard fileSystem.fileExists(at: fileURL) else { return .empty }

        let data: Data
        do {
            data = try fileSystem.read(from: fileURL)
        } catch {
            throw MemoryStoreError.readFailed(path: fileURL.path, message: String(describing: error))
        }

        do {
            return try JSONDecoder().decode(ProfileMemory.self, from: data)
        } catch {
            throw MemoryStoreError.malformedJSON(path: fileURL.path)
        }
    }

    public func save(_ memory: ProfileMemory) throws {
        let data: Data
        do {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
            data = try encoder.encode(memory) + Data("\n".utf8)
        } catch {
            throw MemoryStoreError.writeFailed(path: fileURL.path, message: String(describing: error))
        }

        try prepareBackupIfNeeded()

        do {
            try fileSystem.createDirectory(at: fileURL.deletingLastPathComponent())
            try fileSystem.writeAtomically(data, to: fileURL)
        } catch {
            throw MemoryStoreError.writeFailed(path: fileURL.path, message: String(describing: error))
        }
    }

    @discardableResult
    public func update(key: String, value: String) throws -> ProfileMemory {
        var memory = try load()
        try memory.set(value, forKey: key)
        try save(memory)
        return memory
    }

    @discardableResult
    public func remove(key: String) throws -> ProfileMemory {
        var memory = try load()
        guard memory.removeValue(forKey: key) else { return memory }
        try save(memory)
        return memory
    }

    private func prepareBackupIfNeeded() throws {
        guard !backupPrepared else { return }
        guard fileSystem.fileExists(at: fileURL) else {
            backupPrepared = true
            return
        }
        guard !fileSystem.fileExists(at: backupURL) else {
            backupPrepared = true
            return
        }

        do {
            try fileSystem.copyItem(at: fileURL, to: backupURL)
            backupPrepared = true
        } catch {
            throw MemoryStoreError.backupFailed(path: backupURL.path, message: String(describing: error))
        }
    }
}
