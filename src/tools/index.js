const { listNotes, searchNotes, saveNote } = require("./notes");

function formatSearchResults(results) {
  return results.length > 0
    ? results.map((result) => result.snippet).join("\n\n")
    : "I couldn't find relevant information in your notes.";
}

function formatSavedNote(saved) {
  return saved ? "Saved." : "I couldn't save that note.";
}

function formatNoteFiles(files) {
  return files.length > 0
    ? files.map((file) => `- ${file}`).join("\n")
    : "You don't have any local note files yet.";
}

const tools = {
  search_notes: {
    name: "search_notes",
    description: "Search the user's local notes for a topic",
    inputDescription: "A short search topic or keyword",
    requiresInput: true,
    execute: searchNotes,
    formatResult: formatSearchResults,
    errorMessage: "I couldn't search your notes.",
  },
  save_note: {
    name: "save_note",
    description: "Save a note to the user's personal local notes",
    inputDescription: "The note text to save",
    requiresInput: true,
    execute: saveNote,
    formatResult: formatSavedNote,
    errorMessage: "I couldn't save that note.",
  },
  list_notes: {
    name: "list_notes",
    description: "List the user's available local note files",
    inputDescription: "No input required",
    requiresInput: false,
    execute: listNotes,
    formatResult: formatNoteFiles,
    isValidResult: Array.isArray,
    errorMessage: "I couldn't list your notes.",
  },
};

function getAvailableTools() {
  return Object.values(tools).map(
    ({ name, description, inputDescription, requiresInput }) => ({
      name,
      description,
      inputDescription,
      requiresInput,
    }),
  );
}

function executeTool(name, input) {
  const tool = tools[name];

  if (!tool) {
    return {
      ok: false,
      error: "Unknown tool",
    };
  }

  if (
    tool.requiresInput &&
    (typeof input !== "string" || !input.trim())
  ) {
    return {
      ok: false,
      error: "Tool input is required",
      answer: tool.errorMessage,
    };
  }

  try {
    const result = tool.execute(input);

    if (tool.isValidResult && !tool.isValidResult(result)) {
      return {
        ok: false,
        error: "Tool returned an invalid result",
        answer: tool.errorMessage,
      };
    }

    return {
      ok: true,
      result,
      answer: tool.formatResult(result),
    };
  } catch {
    return {
      ok: false,
      error: "Tool execution failed",
      answer: tool.errorMessage,
    };
  }
}

module.exports = {
  executeTool,
  getAvailableTools,
};
