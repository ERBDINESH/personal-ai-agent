# Personal AI — Swift Chat Core

A Swift-native, testable chat core with persistent personal profile memory for the Personal AI Agent. It is designed so that a
future Windows, iOS or macOS app can reuse it. Milestone 2A adds local profile memory to the core library and
a command-line chat app that talks to a local [Ollama](https://ollama.com) server.

The existing Node.js agent in the repository root is unchanged and still works. The Swift
store reads the same flat `memory/profile.json` schema and preserves unknown JSON fields.

```text
Personal AI — Swift Edition
Model: qwen2.5:3b
Type /help for commands.
Connected to Ollama 0.40.2 at http://127.0.0.1:11434.

You: My favourite programming language is Swift.
AI: That's great to hear! ...

You: What is my favourite programming language?
AI: Your favourite programming language is Swift, as you mentioned earlier in our conversation.

You: exit
Goodbye!
```

See [Docs/ARCHITECTURE.md](Docs/ARCHITECTURE.md) for the design, trade-offs and roadmap.

## Package layout

```text
swift/
├── Package.swift
├── Sources/
│   ├── ChatDomain/    Value types: ChatMessage, Conversation, MessageRole, AIRequest, AIResponse, AIServiceError
│   ├── AgentMemory/   Profile model, JSON store actor, router, and context builder
│   ├── AIProviders/   AIProvider protocol, OllamaProvider, HTTPTransport (URLSession)
│   ├── AgentCore/     ChatSession actor, AgentEngine, PendingTurn, typed errors
│   └── PersonalAI/    CLI executable (main.swift, commands, error messages)
└── Tests/
    ├── ChatDomainTests/
    ├── AgentMemoryTests/  Profile, routing, persistence, concurrency, and migration
    ├── AIProvidersTests/   OllamaProvider against a stub transport (no network)
    └── AgentCoreTests/     Session/engine against a mock provider (no network)
```

## Windows setup

1. **Visual Studio 2022** (or Build Tools 2022) with the *Desktop development with C++*
   workload and a Windows 10/11 SDK. The Swift toolchain links with MSVC.
2. **Swift 6.x for Windows**: `winget install --id Swift.Toolchain` or the installer from
   swift.org. Check with `swift --version`.
3. **Ollama for Windows**: install it, then download the model:
   ```powershell
   ollama pull qwen2.5:3b
   ```

You can run Swift from the *x64 Native Tools Command Prompt for VS 2022*, PowerShell, or
the VS Code terminal. Development was tested with Swift 6.4.2 from both Git Bash and
PowerShell sessions.

## Build, test, run

```powershell
cd swift
swift build
swift test
swift run PersonalAI
```

`swift test` needs no Ollama instance. All provider tests use stubs.

### CLI commands

| Input            | Effect                                                    |
|------------------|-----------------------------------------------------------|
| any text         | Sends a message within the current conversation           |
| `/new`           | Starts a fresh conversation (previous messages forgotten) |
| `/memory`        | Lists validated saved profile facts                       |
| `/memory set <key> <value>` | Saves an explicit profile fact                 |
| `/memory delete <key>` | Deletes one profile field                         |
| `/help`          | Lists commands                                            |
| `exit` / `quit`  | Quits                                                     |

### Configuration (environment variables)

| Variable            | Default                  | Purpose                 |
|---------------------|--------------------------|-------------------------|
| `PERSONAL_AI_MODEL` | `qwen2.5:3b`             | Ollama model name       |
| `OLLAMA_BASE_URL`   | `http://127.0.0.1:11434` | Ollama server root URL  |
| `PERSONAL_AI_MEMORY_PATH` | `../memory/profile.json` | Injected profile JSON path |

```powershell
$env:PERSONAL_AI_MODEL = "qwen3:4b"; swift run PersonalAI
```

### Profile memory

The deterministic router saves only explicit `/memory set` commands and recognized
English/Tanglish declarations such as `My preferred language is Tanglish` or
`En peru Dinesh`. It does not extract personal details from arbitrary chat.

Writes are actor-serialized and atomic. Before the first overwrite of an existing file,
the store creates `profile.json.backup` and never replaces that backup. Malformed JSON is
reported and left untouched. Both the profile and backup are ignored by Git. To keep
separate profiles, launch with a different `PERSONAL_AI_MEMORY_PATH` for each profile.

Saved strings are added to the system prompt as escaped, delimited, untrusted data. The
model is told not to follow instructions in stored keys or values and not to invent
missing profile details.

## Live smoke test (manual)

1. Start Ollama: open the Ollama app, or run `ollama serve` in a separate terminal.
2. Confirm it is running: `curl http://127.0.0.1:11434/api/version`
3. Run the scripted conversation:
   ```powershell
   cd swift
   swift build
   "My favourite programming language is Swift.`nWhat is my favourite programming language?`n/new`nWhat is my favourite programming language?`nexit" | .\.build\debug\PersonalAI.exe
   ```
   Expected: the second answer mentions Swift. After `/new`, the model no longer knows.
4. Error paths:
   - Stop Ollama and run the CLI. A "Could not reach Ollama" warning appears at startup.
   - `$env:PERSONAL_AI_MODEL = "no-such-model:1b"` gives "Model 'no-such-model:1b' is not installed".

## Privacy

Conversations exist only in memory and are never written to disk. Profile facts are stored
only at the configured local JSON path. The profile, its safety backup, `.build/`, and
`.swiftpm/` are git-ignored.
