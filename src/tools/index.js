const { searchNotes, saveNote } = require("./notes");

const tools = {
  search_notes: {
    name: "search_notes",
    description: "Search the user's local notes for a topic",
    inputDescription: "A short search topic or keyword",
    execute: searchNotes,
  },
  save_note: {
    name: "save_note",
    description: "Save a note to the user's personal local notes",
    inputDescription: "The note text to save",
    execute: saveNote,
  },
};

function getAvailableTools() {
  return Object.values(tools).map(
    ({ name, description, inputDescription }) => ({
      name,
      description,
      inputDescription,
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

  try {
    return {
      ok: true,
      result: tool.execute(input),
    };
  } catch {
    return {
      ok: false,
      error: "Tool execution failed",
    };
  }
}

module.exports = {
  executeTool,
  getAvailableTools,
};
