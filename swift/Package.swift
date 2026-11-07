// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "PersonalAI",
    // Declared for future Apple-platform integration. Only Windows builds have been verified so far.
    platforms: [.macOS(.v14), .iOS(.v17)],
    products: [
        .library(name: "ChatDomain", targets: ["ChatDomain"]),
        .library(name: "AIProviders", targets: ["AIProviders"]),
        .library(name: "AgentCore", targets: ["AgentCore"]),
        .executable(name: "PersonalAI", targets: ["PersonalAI"]),
    ],
    targets: [
        .target(name: "ChatDomain"),
        .target(name: "AIProviders", dependencies: ["ChatDomain"]),
        .target(name: "AgentCore", dependencies: ["ChatDomain", "AIProviders"]),
        .executableTarget(name: "PersonalAI", dependencies: ["ChatDomain", "AIProviders", "AgentCore"]),

        .testTarget(name: "ChatDomainTests", dependencies: ["ChatDomain"]),
        .testTarget(name: "AIProvidersTests", dependencies: ["ChatDomain", "AIProviders"]),
        .testTarget(name: "AgentCoreTests", dependencies: ["ChatDomain", "AIProviders", "AgentCore"]),
    ]
)
