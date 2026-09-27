const fs = require("fs");
const path = require("path");

const memoryDirectory = path.join(__dirname, "..", "memory");
const profilePath = path.join(memoryDirectory, "profile.json");

function ensureMemoryFile() {
  if (!fs.existsSync(memoryDirectory)) {
    fs.mkdirSync(memoryDirectory, { recursive: true });
  }

  if (!fs.existsSync(profilePath)) {
    fs.writeFileSync(profilePath, "{}\n", "utf8");
  }
}

function loadMemory() {
  try {
    ensureMemoryFile();

    const content = fs.readFileSync(profilePath, "utf8").trim();

    if (!content) {
      return {};
    }

    const memory = JSON.parse(content);

    if (!memory || typeof memory !== "object" || Array.isArray(memory)) {
      return {};
    }

    return memory;
  } catch {
    return {};
  }
}

function saveMemory(memory) {
  if (!memory || typeof memory !== "object" || Array.isArray(memory)) {
    return false;
  }

  try {
    ensureMemoryFile();
    fs.writeFileSync(profilePath, `${JSON.stringify(memory, null, 2)}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}

function updateMemory(key, value) {
  if (typeof key !== "string" || typeof value !== "string") {
    return false;
  }

  const cleanedKey = key.trim();
  const cleanedValue = value.trim().replace(/[\r\n]+/g, " ");

  if (!cleanedKey || !cleanedValue) {
    return false;
  }

  const memory = loadMemory();
  memory[cleanedKey] = cleanedValue;

  return saveMemory(memory);
}

module.exports = {
  loadMemory,
  saveMemory,
  updateMemory,
};
