const { callModel } = require("./model");
const { routeMessage } = require("./router");
const { selectTool } = require("./tool-selector");
const { loadMemory, updateMemory } = require("./memory");
const { executeTool, getAvailableTools } = require("./tools");

const messages = [];
let userMemory = loadMemory();

function formatMemory(memory) {
  const labels = {
    name: "Name",
    preferredLanguage: "Preferred language",
    profession: "Profession",
  };

  const entries = Object.entries(memory);

  if (entries.length === 0) {
    return "Known user memory:\nNone saved.";
  }

  const lines = entries.map(([key, value]) => {
    const label = labels[key] || key;
    return `${label}: ${value}`;
  });

  return `Known user memory:\n${lines.join("\n")}`;
}

async function handleChat(message) {
  messages.push({
    role: "user",
    content: message,
  });

  const answer = await callModel([
    {
      role: "system",
      content: `
You are a helpful personal AI assistant. Give clear and concise answers.

${formatMemory(userMemory)}

Use this memory when it is relevant to the user's question.
Do not invent missing user facts.
Tanglish in this user's context means Tamil + English mixed conversational language.
Do not redefine Tanglish as Singaporean or Bruneian usage.
`,
    },
    ...messages,
  ]);

  messages.push({
    role: "assistant",
    content: answer,
  });

  return { answer };
}

function handleTool(toolName, input, agentMessage) {
  const toolResult = executeTool(toolName, input);

  return {
    agentMessage,
    answer: toolResult.answer || "I couldn't use that tool.",
  };
}

async function handleMessage(message) {
  const action = await routeMessage(message);

  if (action.type === "TOOL") {
    return handleTool(
      action.tool,
      action.input,
      `Using tool "${action.tool}"...`,
    );
  }

  if (action.type === "SAVE_NOTE") {
    return handleTool("save_note", action.note, "Saving note...");
  }

  if (action.type === "SAVE_MEMORY") {
    const saved = updateMemory(action.key, action.value);

    if (saved) {
      userMemory = loadMemory();
    }

    return {
      agentMessage: "Saving memory...",
      answer: saved ? "Saved." : "I couldn't save that memory.",
    };
  }

  if (action.type === "SEARCH") {
    return handleTool(
      "search_notes",
      action.query,
      `Searching workspace for "${action.query}"...`,
    );
  }

  if (action.type === "CHAT") {
    return handleChat(message);
  }

  const selection = await selectTool(message, getAvailableTools());

  if (selection.type === "TOOL") {
    return handleTool(
      selection.tool,
      selection.input,
      `Using tool "${selection.tool}"...`,
    );
  }

  return handleChat(message);
}

module.exports = {
  handleMessage,
};
