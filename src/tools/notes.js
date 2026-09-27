const fs = require("fs");
const path = require("path");

const workspacePath = path.join(__dirname, "..", "..", "workspace");
const personalNotesPath = path.join(workspacePath, "personal-notes.txt");

function searchNotes(query) {
  const files = fs.readdirSync(workspacePath);
  const results = [];
  const normalizedQuery = query.toLowerCase();

  for (const file of files) {
    const filePath = path.join(workspacePath, file);
    const stats = fs.lstatSync(filePath);

    if (!stats.isFile()) {
      continue;
    }

    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(normalizedQuery)) {
        const start = Math.max(0, i);
        const end = Math.min(lines.length, i + 5);

        const snippet = lines
          .slice(start, end)
          .filter((line) => line.trim() !== "")
          .join("\n");

        results.push({
          file,
          snippet,
        });
      }
    }
  }

  return results;
}

function saveNote(note) {
  if (typeof note !== "string") {
    return false;
  }

  const cleanedNote = note.trim().replace(/[\r\n]+/g, " ");

  if (!cleanedNote) {
    return false;
  }

  try {
    fs.appendFileSync(personalNotesPath, `${cleanedNote}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  searchNotes,
  saveNote,
};
