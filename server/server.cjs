// server/server.cjs
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const multer = require('multer');

const {
  readMemory,
  writeMemory,
  addGoal,
  addFeature,
  addNote,
  searchMemory
} = require('./memorymanager.cjs');

const OpenAI = require("openai");

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// === Files setup for FileBrowser ===
const FILES_DIR = path.join(__dirname, 'files');
if (!fs.existsSync(FILES_DIR)) fs.mkdirSync(FILES_DIR, { recursive: true });
const upload = multer({ dest: FILES_DIR });

// === OpenAI client ===
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// =================== Memory APIs ===================

// Get full memory
app.get('/api/memory', (req, res) => {
  const memory = readMemory();
  res.json(memory);
});

// Search memory
app.get('/api/memory/search', (req, res) => {
  const keyword = req.query.keyword;
  if (!keyword) {
    return res.status(400).json({ error: 'Keyword is required' });
  }
  const results = searchMemory(keyword);
  res.json(results);
});

// Add goal
app.post('/api/memory/goals', (req, res) => {
  const goal = req.body;
  if (!goal || !goal.text) {
    return res.status(400).json({ error: 'Goal must have text' });
  }
  addGoal(goal);
  res.status(201).json({ success: true });
});

// Add feature
app.post('/api/memory/features', (req, res) => {
  const feature = req.body;
  if (!feature || !feature.text) {
    return res.status(400).json({ error: 'Feature must have text' });
  }
  addFeature(feature);
  res.status(201).json({ success: true });
});

// Add note
app.post('/api/memory/notes', (req, res) => {
  const note = req.body;
  if (!note || !note.text) {
    return res.status(400).json({ error: 'Note must have text' });
  }
  addNote(note);
  res.status(201).json({ success: true });
});

// Ask RamRoot (uses short memory slice for safety)
app.post('/api/ask', async (req, res) => {
  const { prompt } = req.body;
  const memory = readMemory();

  const shortMemory = {
    goals: memory.goals?.slice(-5) ?? [],
    notes: memory.notes?.slice(-10) ?? [],
    features: memory.features?.slice(-5) ?? [],
    tasks: memory.tasks?.slice(-10) ?? [],
  };

  const messages = [
    {
      role: "system",
      content: "You are RamRoot, a personal AI built by Charles Alan Ramshur. You remember his family, goals, inventions, and struggles. You serve him with loyalty and Godly wisdom."
    },
    {
      role: "user",
      content: `Recent memory:\n${JSON.stringify(shortMemory, null, 2)}`
    },
    {
      role: "user",
      content: prompt
    }
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messages
    });

    const reply = completion.choices[0].message.content;
    res.json({ reply });
  } catch (error) {
    console.error('❌ OpenAI error:', error.message);
    res.status(500).json({ error: "OpenAI error" });
  }
});

// =================== File APIs for FileBrowser ===================

// List files
app.get('/files', (req, res) => {
  const files = fs.readdirSync(FILES_DIR);
  res.json(files);
});

// Get a file's text content
app.get('/files/:name', (req, res) => {
  const filePath = path.join(FILES_DIR, req.params.name);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.type('text/plain').send(fs.readFileSync(filePath, 'utf8'));
});

// Upload a file
app.post('/upload', upload.single('file'), (req, res) => {
  const tempPath = req.file.path;
  const finalPath = path.join(FILES_DIR, req.file.originalname);
  fs.renameSync(tempPath, finalPath);
  res.json({ success: true, name: req.file.originalname });
});

// ✅ Start backend server
app.get('/', (req, res) => {
  res.send('✅ RamRoot backend is running successfully.');
});

app.listen(port, () => {
  console.log(`✅ RamRoot backend running on http://localhost:${port}`);
});
