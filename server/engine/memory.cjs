const fs = require("fs");
const path = require("path");

const DEFAULT = {
  principles: [
    "Be clear and minimal.",
    "Prefer small diffs.",
    "Don't write secrets or credentials."
  ],
  preferences: {},
  non_negotiables: [],
  facts: []
};

const MEM_PATH = path.join(process.cwd(), "server", "files", "memory.json");

function loadMemoryFile() {
  try {
    if (fs.existsSync(MEM_PATH)) {
      const txt = fs.readFileSync(MEM_PATH, "utf8");
      const obj = JSON.parse(txt);
      if (obj && typeof obj === "object") return obj;
    }
  } catch {}
  return { ...DEFAULT };
}

function saveMemoryFile(obj) {
  try {
    fs.mkdirSync(path.dirname(MEM_PATH), { recursive: true });
    fs.writeFileSync(MEM_PATH, JSON.stringify(obj, null, 2), "utf8");
  } catch (e) {
    console.error("saveMemoryFile failed:", e);
  }
}

function memoryContext() {
  const m = loadMemoryFile();
  return {
    principles: Array.isArray(m.principles) ? m.principles : [],
    preferences: (m.preferences && typeof m.preferences === "object") ? m.preferences : {},
    non_negotiables: Array.isArray(m.non_negotiables) ? m.non_negotiables : [],
    facts: Array.isArray(m.facts) ? m.facts.slice(-20) : [] // keep a small slice in the prompt
  };
}

function rememberFacts(items = []) {
  const m = loadMemoryFile();
  if (!Array.isArray(m.facts)) m.facts = [];
  for (const it of items) {
    if (it && it.value) {
      // de-dupe by value
      if (!m.facts.some(f => f.value === it.value)) {
        m.facts.push({ type: it.type || "note", value: it.value, ts: it.ts || new Date().toISOString() });
      }
    }
  }
  const MAX = 200;
  if (m.facts.length > MAX) m.facts = m.facts.slice(-MAX);
  saveMemoryFile(m);
  return m;
}

module.exports = { memoryContext, rememberFacts, loadMemoryFile };
