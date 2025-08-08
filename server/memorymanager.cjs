const fs = require('fs');
const path = require('path');

// Path to memory.json
const memoryPath = path.join(__dirname, 'public', 'memory.json');

// READ memory.json
function readMemory() {
  try {
    const data = fs.readFileSync(memoryPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading memory.json:', err);
    return {};
  }
}

// WRITE to memory.json
function writeMemory(data) {
  try {
    fs.writeFileSync(memoryPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing to memory.json:', err);
  }
}

// ADD a goal
function addGoal(goal) {
  const memory = readMemory();
  if (!memory.goals) memory.goals = [];
  memory.goals.push(goal);
  writeMemory(memory);
}

// ADD a feature
function addFeature(feature) {
  const memory = readMemory();
  if (!memory.features) memory.features = [];
  memory.features.push(feature);
  writeMemory(memory);
}

// ADD a note
function addNote(note) {
  const memory = readMemory();
  if (!memory.notes) memory.notes = [];
  memory.notes.push(note);
  writeMemory(memory);
}

// SEARCH memory.json
function searchMemory(keyword) {
  const memory = readMemory();
  const result = {};

  for (const key in memory) {
    if (Array.isArray(memory[key])) {
      result[key] = memory[key].filter(item =>
        item.text && item.text.toLowerCase().includes(keyword.toLowerCase())
      );
    }
  }

  return result;
}

module.exports = {
  readMemory,
  writeMemory,
  addGoal,
  addFeature,
  addNote,
  searchMemory
};
