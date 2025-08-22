// server/memorymanager.cjs
const fs = require('fs');
const path = require('path');

const LIVE = path.join(__dirname, 'public', 'memory.json');
const SANDBOX = path.join(__dirname, 'public', 'memory.sandbox.json');

function ensureDir(p) { fs.mkdirSync(path.dirname(p), { recursive: true }); }
function defaultMemory() {
  return { goals: [], features: [], notes: [], tasks: [] };
}
function readFileSafe(p) {
  try {
    if (!fs.existsSync(p)) return defaultMemory();
    const txt = fs.readFileSync(p, 'utf8');
    const data = JSON.parse(txt);
    return (data && typeof data === 'object') ? data : defaultMemory();
  } catch { return defaultMemory(); }
}
function writeFileSafe(p, data) {
  ensureDir(p);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function resolvePath(opts = {}) {
  const s = opts.sandbox;
  const on = s === true || s === '1' || s === 'true';
  return on ? SANDBOX : LIVE;
}

// ---- Public API used by server.cjs ----
function readMemory(opts = {}) {
  return readFileSafe(resolvePath(opts));
}
function writeMemory(data, opts = {}) {
  writeFileSafe(resolvePath(opts), data);
  return true;
}

function addItem(arr, item, opts = {}) {
  const mem = readMemory(opts);
  const rec = (typeof item === 'string') ? { text: item } : (item || {});
  if (!rec.createdAt) rec.createdAt = new Date().toISOString();
  if (!Array.isArray(mem[arr])) mem[arr] = [];
  mem[arr].push(rec);
  writeMemory(mem, opts);
  return rec;
}
function addGoal(goal, opts = {})    { return addItem('goals', goal, opts); }
function addFeature(f, opts = {})    { return addItem('features', f, opts); }
function addNote(note, opts = {})    { return addItem('notes', note, opts); }

function searchMemory(keyword, opts = {}) {
  const k = String(keyword || '').toLowerCase();
  const mem = readMemory(opts);
  const pick = (arr) => (arr || []).filter(x => String(x.text || '').toLowerCase().includes(k));
  return { goals: pick(mem.goals), features: pick(mem.features), notes: pick(mem.notes), tasks: pick(mem.tasks) };
}

// ---- Sandbox controls ----
function promoteSandbox() {
  if (!fs.existsSync(SANDBOX)) return { ok: false, reason: 'no_sandbox' };
  const data = readFileSafe(SANDBOX);
  writeFileSafe(LIVE, data);
  return { ok: true };
}
function clearSandbox() {
  try {
    if (fs.existsSync(SANDBOX)) fs.unlinkSync(SANDBOX);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = {
  LIVE_PATH: LIVE,
  SANDBOX_PATH: SANDBOX,
  readMemory,
  writeMemory,
  addGoal,
  addFeature,
  addNote,
  searchMemory,
  promoteSandbox,
  clearSandbox
};
