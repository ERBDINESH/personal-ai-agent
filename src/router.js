const { callModel } = require("./model");

function getNoteFromSaveRequest(message) {
  const savePatterns = [
    /^remember\s+this(?:\s*[-:]\s*|\s+)(.*)$/i,
    /^remember\s+that(?:\s*[-:]\s*|\s+)(.*)$/i,
    /^save\s+this\s+note(?:\s*[-:]\s*|\s+)(.*)$/i,
    /^note\s+this(?:\s*[-:]\s*|\s+)(.*)$/i,
    /^itha\s+remember\s+pannu(?:\s*[-:]\s*|\s+)(.*)$/i,
    /^itha\s+note\s+pannu(?:\s*[-:]\s*|\s+)(.*)$/i,
  ];

  for (const pattern of savePatterns) {
    const match = message.match(pattern);

    if (match) {
      return match[1].trim();
    }
  }

  return null;
}

function getMemoryFromMessage(message) {
  const memoryPatterns = [
    { key: "preferredLanguage", pattern: /^my preferred language is\s+(.+)$/i },
    { key: "name", pattern: /^my name is\s+(.+)$/i },
    { key: "profession", pattern: /^my profession is\s+(.+)$/i },
    {
      key: "preferredLanguage",
      pattern: /^en preferred language(?: is)?\s+(.+)$/i,
    },
    { key: "name", pattern: /^en peru\s+(.+)$/i },
    {
      key: "profession",
      pattern:
        /^i am an?\s+(.+\b(?:developer|engineer|designer|manager|teacher|doctor|student))\.?$/i,
    },
    {
      key: "profession",
      pattern:
        /^naa\s+(.+\b(?:developer|engineer|designer|manager|teacher|doctor|student))\.?$/i,
    },
  ];

  for (const { key, pattern } of memoryPatterns) {
    const match = message.match(pattern);

    if (match) {
      const value = match[1].trim().replace(/[.!]+$/, "");
      return { key, value };
    }
  }

  return null;
}

function getSearchQuery(message) {
  const searchPatterns = [
    /\bennoda\s+(.+?)\s+notes\b/i,
    /\bwhat did i write about\s+(.+)$/i,
  ];

  for (const pattern of searchPatterns) {
    const match = message.match(pattern);

    if (match) {
      return match[1].trim().replace(/[?.!]+$/, "");
    }
  }

  return null;
}

async function routeMessage(message) {
  const note = getNoteFromSaveRequest(message);

  if (note !== null) {
    return { type: "SAVE_NOTE", note };
  }

  const memory = getMemoryFromMessage(message);

  if (memory) {
    return { type: "SAVE_MEMORY", ...memory };
  }

  const query = getSearchQuery(message);

  if (query !== null) {
    return { type: "SEARCH", query };
  }

  const decision = await callModel([
    {
      role: "system",
      content: `
You are a routing component for a personal AI agent.

Your job is ONLY to decide whether the user wants information from their own local notes/files.

Return exactly one of these formats:

SEARCH: <single best search keyword>
CHAT

Rules:

Use SEARCH when the user refers to:
- my notes
- my files
- what did I write
- what do I have about something
- find something in my notes
- ennoda notes
- naan eluthunathu
- notes find pannu
- workspace content

Extract ONLY the main technical topic as the keyword.

Examples:

User: ennoda Combine notes find pannu
SEARCH: Combine

User: What did I write about Actor?
SEARCH: Actor

User: ennoda UIKit notes enna?
SEARCH: UIKit

User: What notes do I have about Dependency Injection?
SEARCH: Dependency Injection

User: Explain Combine
CHAT

User: What is MVVM?
CHAT

User: Teach me Actor
CHAT

Do not include words such as:
my, ennoda, notes, find, pannu, what, about, write.

Respond with ONE LINE only.
`,
    },
    {
      role: "user",
      content: message,
    },
  ]);

  const firstLine = decision.trim().split("\n")[0];

  if (firstLine.startsWith("SEARCH:")) {
    return {
      type: "SEARCH",
      query: firstLine.substring(7).trim(),
    };
  }

  return { type: "CHAT" };
}

module.exports = {
  routeMessage,
};
