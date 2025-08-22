// server/engine/memory.cjs
const fs = require('fs');
const path = require('path');

function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

function locateMemory() {
  const candidates = [
    path.join(process.cwd(), 'server', 'public', 'memory.json'),
    path.join(process.cwd(), 'public', 'memory.json')
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
}

function normalizeMemory(raw) {
  const m = raw || {};
  return {
    // v2 shape (optional)
    principles: Array.isArray(m.principles) ? m.principles : [],
    preferences: (m.preferences && typeof m.preferences === 'object') ? m.preferences : {},
    constraints: Array.isArray(m.constraints) ? m.constraints : [],
    // v1 shape (your current file)
    goals: Array.isArray(m.goals) ? m.goals : [],
    features: Array.isArray(m.features) ? m.features : [],
    notes: Array.isArray(m.notes) ? m.notes : [],
    tasks: Array.isArray(m.tasks) ? m.tasks : [],
  };
}

function getMemory() {
  const p = locateMemory();
  const raw = p ? readJsonSafe(p) : null;
  return normalizeMemory(raw);
}

function memoryContext() {
  const m = getMemory();

  const prefs = Object.entries(m.preferences || {})
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join('; ');

  const takeText = (arr, n) =>
    (arr || [])
      .slice(-n)
      .map(x => (typeof x === 'string' ? x : (x?.text ?? '')))
      .filter(Boolean)
      .join(' | ');

  const recentGoals = takeText(m.goals, 3);
  const recentFeatures = takeText(m.features, 3);
  const recentNotes = takeText(m.notes, 3);

  const lines = [
    '# RamRoot Memory',
    m.principles?.length ? `Principles: ${m.principles.join('; ')}` : null,
    prefs ? `Key Prefs: ${prefs}` : null,
    m.constraints?.length ? `Non-negotiables: ${m.constraints.join('; ')}` : null,
    recentGoals ? `Recent goals: ${recentGoals}` : null,
    recentFeatures ? `Recent features: ${recentFeatures}` : null,
    recentNotes ? `Notes: ${recentNotes}` : null,
  ].filter(Boolean);

  return lines.join('\n');
}

module.exports = { getMemory, memoryContext };
