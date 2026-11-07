import AgentMemory
import Testing

@Suite("MessageRouter")
struct MessageRouterTests {
    let router = MessageRouter()

    @Test("Routes English declarations deterministically", arguments: [
        ("My preferred language is Tanglish.", "preferredLanguage", "Tanglish"),
        ("My name is Dinesh!", "name", "Dinesh"),
        ("My profession is software engineer.", "profession", "software engineer"),
        ("I am a product designer.", "profession", "product designer"),
    ])
    func english(message: String, key: String, value: String) {
        #expect(router.route(message) == .saveMemory(key: key, value: value))
    }

    @Test("Routes Tanglish declarations deterministically", arguments: [
        ("En preferred language is Tanglish", "preferredLanguage", "Tanglish"),
        ("En peru Dinesh", "name", "Dinesh"),
        ("Naa software developer", "profession", "software developer"),
    ])
    func tanglish(message: String, key: String, value: String) {
        #expect(router.route(message) == .saveMemory(key: key, value: value))
    }

    @Test("Supports explicit set commands")
    func explicitCommand() {
        #expect(router.route("/memory set timezone Asia/Calcutta") == .saveMemory(key: "timezone", value: "Asia/Calcutta"))
        #expect(router.route("/memory set preferredLanguage = Tanglish") == .saveMemory(key: "preferredLanguage", value: "Tanglish"))
    }

    @Test("Does not extract arbitrary personal conversation")
    func noAutonomousExtraction() {
        #expect(router.route("I visited Chennai yesterday") == .chat)
        #expect(router.route("My favorite color might be blue") == .chat)
        #expect(router.route("Remember this story for later") == .chat)
    }
}
