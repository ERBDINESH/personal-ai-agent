public protocol MemoryStore: Sendable {
    func load() async throws -> ProfileMemory
    func save(_ memory: ProfileMemory) async throws
    @discardableResult
    func update(key: String, value: String) async throws -> ProfileMemory
    @discardableResult
    func remove(key: String) async throws -> ProfileMemory
}
