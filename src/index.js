const readline = require("readline");
const { searchFiles, saveNote } = require("./tools");
const { loadMemory, updateMemory } = require("./memory");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const messages = [];
let userMemory = loadMemory();

function getMemoryFromMessage(message) {
  const memoryPatterns = [
    { key: "preferredLanguage", pattern: /^my preferred language is\s+(.+)$/i },
    { key: "name", pattern: /^my name is\s+(.+)$/i },
    { key: "profession", pattern: /^my profession is\s+(.+)$/i },
    { key: "preferredLanguage", pattern: /^en preferred language(?: is)?\s+(.+)$/i },
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

async function callModel(messages, model = "qwen2.5:3b") {
  const response = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();

  return data.message.content;
}

async function decideAction(message) {
  const explicitSearchPatterns = [
    /\bennoda\s+(.+?)\s+notes\b/i,
    /\bwhat did i write about\s+(.+)$/i,
  ];

  for (const pattern of explicitSearchPatterns) {
    const match = message.match(pattern);

    if (match) {
      const topic = match[1].trim().replace(/[?.!]+$/, "");
      return `SEARCH: ${topic}`;
    }
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

  return decision.trim().split("\n")[0];
}

async function askAI(message) {
  try {
    const note = getNoteFromSaveRequest(message);

    if (note !== null) {
      console.log("\nAgent: Saving note...");

      if (saveNote(note)) {
        console.log("\nAI: Saved.\n");
      } else {
        console.log("\nAI: I couldn't save that note.\n");
      }

      return;
    }

    const memoryUpdate = getMemoryFromMessage(message);

    if (memoryUpdate) {
      console.log("\nAgent: Saving memory...");

      if (updateMemory(memoryUpdate.key, memoryUpdate.value)) {
        userMemory = loadMemory();
        console.log("\nAI: Saved.\n");
      } else {
        console.log("\nAI: I couldn't save that memory.\n");
      }

      return;
    }

    const action = await decideAction(message);

    if (action.startsWith("SEARCH:")) {
      const query = action.substring(7).trim();

      console.log(`\nAgent: Searching workspace for "${query}"...`);

      const results = searchFiles(query);

      if (results.length === 0) {
        console.log(
          "\nAI: I couldn't find relevant information in your notes.\n",
        );
        return;
      }

      const answer = results.map((result) => result.snippet).join("\n\n");

      console.log(`\nAI: ${answer}\n`);

      return;
    }

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

    console.log(`\nAI: ${answer}\n`);
  } catch (error) {
    console.error("\nError:", error.message, "\n");
  }
}

function chat() {
  rl.question("You: ", async (input) => {
    const message = input.trim().replace(/^you:\s*/i, "");

    if (message.toLowerCase() === "exit") {
      console.log("\nAI: Bye!");
      rl.close();
      return;
    }

    if (!message) {
      chat();
      return;
    }

    await askAI(message);

    chat();
  });
}

console.log("Personal AI Agent");
console.log("Type 'exit' to quit.\n");

chat();
