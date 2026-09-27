const { callModel } = require("./model");

function parseToolSelection(output, availableTools) {
  try {
    const selection = JSON.parse(output.trim());

    if (!selection || typeof selection !== "object" || Array.isArray(selection)) {
      return { type: "CHAT" };
    }

    if (selection.type === "CHAT") {
      return { type: "CHAT" };
    }

    if (selection.type !== "TOOL") {
      return { type: "CHAT" };
    }

    const keys = Object.keys(selection).sort();
    const expectedKeys = ["input", "tool", "type"];

    if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
      return { type: "CHAT" };
    }

    if (
      typeof selection.tool !== "string" ||
      !selection.tool.trim() ||
      typeof selection.input !== "string"
    ) {
      return { type: "CHAT" };
    }

    const toolName = selection.tool.trim();
    const selectedTool = availableTools.find((tool) => tool.name === toolName);

    if (!selectedTool) {
      return { type: "CHAT" };
    }

    const input = selection.input.trim();

    if (selectedTool.requiresInput !== false && !input) {
      return { type: "CHAT" };
    }

    return {
      type: "TOOL",
      tool: toolName,
      input,
    };
  } catch {
    return { type: "CHAT" };
  }
}

async function selectTool(message, availableTools) {
  const toolList = availableTools.map(
    ({ name, description, inputDescription, requiresInput }) => ({
      name,
      description,
      inputDescription,
      requiresInput,
    }),
  );

  const output = await callModel([
    {
      role: "system",
      content: `
You select a tool for a personal AI agent.

Available tools:
${JSON.stringify(toolList, null, 2)}

Return valid JSON only. Do not include markdown or explanations.

Return exactly one of these shapes:
{"type":"TOOL","tool":"registered_tool_name","input":"concise tool input"}
{"type":"CHAT"}

Rules:
- Select only a tool listed in Available tools.
- Never invent a tool name.
- Use a tool only when the user's request requires that capability.
- Use CHAT for general knowledge, explanations, or conversation.
- Extract concise tool input without command words.
- Tools with requiresInput false must use an empty string for input.
- Do not execute or suggest shell commands.

Examples:
User: Search my notes for XCTest
{"type":"TOOL","tool":"search_notes","input":"XCTest"}

User: Do I have anything about actors in my notes?
{"type":"TOOL","tool":"search_notes","input":"Actor"}

User: Save a note that Swift actors protect shared state
{"type":"TOOL","tool":"save_note","input":"Swift actors protect shared state"}

User: What notes do I have?
{"type":"TOOL","tool":"list_notes","input":""}

User: Explain actor isolation
{"type":"CHAT"}
`,
    },
    {
      role: "user",
      content: message,
    },
  ]);

  return parseToolSelection(output, toolList);
}

module.exports = {
  parseToolSelection,
  selectTool,
};
