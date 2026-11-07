import Foundation

/// Tiny console helper. Writes go straight to the stdout file handle (unbuffered),
/// so prompts such as "You: " appear before `readLine()` blocks.
enum Console {
    static func write(_ text: String) {
        FileHandle.standardOutput.write(Data(text.utf8))
    }

    static func line(_ text: String = "") {
        write(text + "\n")
    }

    static func error(_ text: String) {
        FileHandle.standardError.write(Data((text + "\n").utf8))
    }

    /// Returns `nil` at end of input (Ctrl+Z on Windows, Ctrl+D elsewhere, or a closed pipe).
    static func prompt(_ label: String) -> String? {
        write(label)
        return readLine(strippingNewline: true)
    }
}
