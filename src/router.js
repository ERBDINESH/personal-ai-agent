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

function isKnownChatRequest(message) {
  const isGeneralQuestion = /^(what is|explain|teach me)\b/i.test(message);
  const mentionsLocalContent = /\b(my notes|my files|workspace)\b/i.test(message);

  return isGeneralQuestion && !mentionsLocalContent;
}

function routeMessage(message) {
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

  if (isKnownChatRequest(message)) {
    return { type: "CHAT" };
  }

  return { type: "UNRESOLVED" };
}

module.exports = {
  routeMessage,
};
