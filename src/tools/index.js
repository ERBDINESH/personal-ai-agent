const { searchNotes, saveNote } = require("./notes");

const tools = {
  search_notes: {
    description: "Search the user's local notes",
    execute: searchNotes,
  },
  save_note: {
    description: "Save a note to the user's local notes",
    execute: saveNote,
  },
};

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
  tools,
  executeTool,
};
