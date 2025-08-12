// server/server.cjs
const express = require('express');
const cors = require('cors');
require('dotenv').config(); // loads server/.env

const fs = require('fs');
const path = require('path');
const multer = require('multer');
const cheerio = require('cheerio');
const { execSync } = require('child_process');
const { Octokit } = require('@octokit/rest');

// also load the root .env so your existing layout works
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

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
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// === GitHub client + helpers for PR autopilot ===
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const GITHUB_REPO = process.env.GITHUB_REPO || ""; // "owner/name"
const [OWNER, REPO] = GITHUB_REPO.split('/');
const repoRoot = path.join(__dirname, '..');
function run(cmd) {
  return execSync(cmd, { cwd: repoRoot, stdio: 'pipe' }).toString();
}

// ---------- One-liner reasoner ----------
async function extractOneLine(question, passages) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: "Answer in ONE short line. Be specific. If it's a person, give full name and role; include start/inauguration date if present. If passages don’t contain the answer, reply exactly: I don’t have that from the sources." },
        { role: "user", content: `Question: ${question}\n\nPassages:\n${passages}\n\nOne-line answer:` }
      ],
    });
    return (completion.choices?.[0]?.message?.content || "").trim();
  } catch (e) {
    console.error("extractOneLine error:", e.message);
    return "";
  }
}

// =================== Memory APIs ===================
app.get('/api/memory', (req, res) => res.json(readMemory()));

app.get('/api/memory/search', (req, res) => {
  const keyword = req.query.keyword;
  if (!keyword) return res.status(400).json({ error: 'Keyword is required' });
  res.json(searchMemory(keyword));
});

app.post('/api/memory/goals', (req, res) => {
  const goal = req.body;
  if (!goal?.text) return res.status(400).json({ error: 'Goal must have text' });
  addGoal(goal); res.status(201).json({ success: true });
});

app.post('/api/memory/features', (req, res) => {
  const feature = req.body;
  if (!feature?.text) return res.status(400).json({ error: 'Feature must have text' });
  addFeature(feature); res.status(201).json({ success: true });
});

app.post('/api/memory/notes', (req, res) => {
  const note = req.body;
  if (!note?.text) return res.status(400).json({ error: 'Note must have text' });
  addNote(note); res.status(201).json({ success: true });
});

// =================== Chat API ===================
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
    { role: "system", content: "You are RamRoot, a personal AI built by Charles Alan Ramshur. You remember his family, goals, inventions, and struggles. You serve him with loyalty and Godly wisdom." },
    { role: "user", content: `Recent memory:\n${JSON.stringify(shortMemory, null, 2)}` },
    { role: "user", content: prompt }
  ];

  try {
    const completion = await openai.chat.completions.create({ model: "gpt-4o", messages });
    res.json({ reply: completion.choices[0].message.content });
  } catch (error) {
    console.error('❌ OpenAI error:', error.message);
    res.status(500).json({ error: "OpenAI error" });
  }
});

// =================== File APIs ===================
app.get('/files', (req, res) => res.json(fs.readdirSync(FILES_DIR)));

app.get('/files/:name', (req, res) => {
  const filePath = path.join(FILES_DIR, req.params.name);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.type('text/plain').send(fs.readFileSync(filePath, 'utf8'));
});

app.post('/upload', upload.single('file'), (req, res) => {
  const tempPath = req.file.path;
  const finalPath = path.join(FILES_DIR, req.file.originalname);
  fs.renameSync(tempPath, finalPath);
  res.json({ success: true, name: req.file.originalname });
});

// =================== Live Knowledge (zero-key) ===================
const DEFAULT_HEADERS = {
  accept: 'application/json',
  'user-agent': 'RamRoot/1.0 (+https://github.com/charlesramshur/ramroots)'
};

async function fetchJSON(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { headers: DEFAULT_HEADERS });
    if (r.ok) return r.json();
    lastErr = new Error(`Fetch failed ${r.status}`);
    if (r.status === 429) { await new Promise(res => setTimeout(res, 600 * (i + 1))); continue; }
    break;
  }
  throw lastErr || new Error('Fetch failed');
}
async function fetchText(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { headers: DEFAULT_HEADERS });
    if (r.ok) return r.text();
    lastErr = new Error(`Fetch failed ${r.status}`);
    if (r.status === 429) { await new Promise(res => setTimeout(res, 600 * (i + 1))); continue; }
    break;
  }
  throw lastErr || new Error('Fetch failed');
}

// DuckDuckGo quick answers
async function ddgInstant(q) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;
  const j = await fetchJSON(url);
  const answer = (j.AbstractText || "").trim();
  const primaryUrl =
    j.AbstractURL ||
    (Array.isArray(j.Results) && j.Results[0]?.FirstURL) ||
    (Array.isArray(j.RelatedTopics) && j.RelatedTopics[0]?.FirstURL) ||
    null;
  return { answer, sources: primaryUrl ? [{ title: j.AbstractSource || "DuckDuckGo", url: primaryUrl }] : [] };
}

// Wikipedia helpers
async function wikipediaSearchPages(q, limit = 5) {
  let pages = [];
  try {
    const s1 = await fetchJSON(`https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(q)}&limit=${limit}`);
    pages = s1?.pages || [];
  } catch {}
  if (!pages.length) {
    try {
      const s2 = await fetchJSON(`https://en.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(q)}&limit=${limit}`);
      pages = s2?.pages || [];
    } catch {}
  }
  return pages;
}
async function wikipediaSummary(title) {
  const sum = await fetchJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
  const answer = (sum.extract || sum.description || "").trim();
  const url = sum?.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;
  return { answer, title: sum?.title || title, url };
}
async function wikipediaRelated(title) {
  try {
    const rel = await fetchJSON(`https://en.wikipedia.org/api/rest_v1/page/related/${encodeURIComponent(title)}`);
    return rel?.pages || rel?.related || rel?.items || [];
  } catch { return []; }
}

// Infobox field extractor
function inferInfoboxKeys(q) {
  const s = q.toLowerCase();
  const keys = [];
  if (/\b(police chief|chief of police|police)\b/.test(s)) keys.push(/^(agency\s+executive|chief|commissioner)/i);
  if (/\bmayor\b/.test(s)) keys.push(/^mayor/i);
  if (/\bgovernor\b/.test(s)) keys.push(/^governor/i);
  if (/\bpresident\b/.test(s)) keys.push(/^(incumbent|president)/i);
  if (/\bceo\b|\bchief executive\b/.test(s)) keys.push(/^(ceo|chief executive officer)/i);
  if (/\bchair|chairman|chairperson\b/.test(s)) keys.push(/^(chair|chairperson|chairman)/i);
  return keys;
}
async function wikipediaInfoboxValue(title, keyRegexes) {
  if (!keyRegexes?.length) return null;
  const html = await fetchText(`https://en.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(title)}`);
  const $ = cheerio.load(html);
  let result = null;
  $('table.infobox tr').each((_, el) => {
    const th = $(el).find('th').first();
    const td = $(el).find('td').first();
    if (!th.length || !td.length) return;
    const label = th.text().trim().toLowerCase();
    for (const re of keyRegexes) {
      if (re.test(label)) {
        const value = td.text().replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim();
        if (value) result = value;
        return false;
      }
    }
  });
  return result;
}

// Prefer the actual person; avoid “Miami Beach” when user just said “Miami”
async function wikipediaAnswer(q) {
  const pages = await wikipediaSearchPages(q, 5);
  if (!pages.length) return { answer: "", sources: [] };

  const lowerQ = q.toLowerCase();
  const penalizeBeach = /\bmiami\b/.test(lowerQ) && !/\bbeach\b/.test(lowerQ);

  pages.sort((a, b) => {
    const ta = (a.key || a.title || '').toLowerCase();
    const tb = (b.key || b.title || '').toLowerCase();
    let sa = 0, sb = 0;
    if (/\b(mayor|chief|police|governor|president)\b/.test(ta)) sa += 2;
    if (/\b(mayor|chief|police|governor|president)\b/.test(tb)) sb += 2;
    if (penalizeBeach) {
      if (/miami beach/.test(ta)) sa -= 3;
      if (/miami beach/.test(tb)) sb -= 3;
    }
    return sb - sa;
  });

  let pick = pages[0];
  let chosenTitle = pick.key || pick.title;

  const looksLikeOffice = /president of the united states|first lady of the united states|mayor of|police department|chief of police/i;
  if (chosenTitle && looksLikeOffice.test(chosenTitle) && /\bcurrent\b/.test(lowerQ)) {
    const rel = await wikipediaRelated(chosenTitle);
    const relPick =
      rel.find(p => /(\d{1,2}(st|nd|rd|th)\s+president of the united states|american politician.*president)/i
                      .test((p.description || '').toLowerCase())) ||
      rel.find(p => /(first lady of the united states|american politician)/i
                      .test((p.description || '').toLowerCase())) ||
      rel[0];
    if (relPick?.title) chosenTitle = relPick.title || relPick.key || chosenTitle;
  }

  const sum = await wikipediaSummary(chosenTitle);

  const keyRegexes = inferInfoboxKeys(q);
  let infoboxVal = null;
  try { infoboxVal = await wikipediaInfoboxValue(chosenTitle, keyRegexes); } catch {}

  const passage = infoboxVal ? `${sum.answer}\nInfobox: ${infoboxVal}` : sum.answer;

  return {
    answer: passage,
    sources: [{ title: sum.title || chosenTitle, url: sum.url }]
  };
}

// Query normalizer
function cleanQuestion(raw) {
  let s = (raw || '').toString().trim();

  s = s.replace(/\b(right now|today|currently|as of|please|kindly)\b/gi, ' ')
       .replace(/\bwhos\b/gi, 'who is')
       .replace(/\bwho's\b/gi, 'who is')
       .replace(/\bwhat's\b/gi, 'what is')
       .replace(/\bU\.?S\.?A?\.?\b/gi, 'United States')
       .replace(/\bUS\b/gi, 'United States')
       .replace(/\bour\b/gi, 'the');

  if (/^\s*who\s+is\s+/i.test(s) && !/\b(current|incumbent)\b/i.test(s)) {
    s = 'current ' + s.replace(/^\s*who\s+is\s+/i, '');
  }
  if (/\bcurrent\s+(the\s+)?president\b/i.test(s) && !/\b(united states|usa|u\.s\.)\b/i.test(s)) {
    s = 'current president of the United States';
  }

  s = s.replace(/\bmayor of miami\b/i, 'current mayor of the City of Miami');
  s = s.replace(/\b(police chief.*houston police department|chief of police.*houston)\b/i,
                'current Chief of Police of the Houston Police Department');

  return s.replace(/\s+/g, ' ').trim();
}

// Main knowledge route
app.get('/api/knowledge', async (req, res) => {
  try {
    const raw = (req.query.q || "").toString().trim();
    if (!raw) return res.status(400).json({ error: "Missing q" });
    const q = cleanQuestion(raw);

    // 1) DDG first
    let answer = "", sources = [];
    try {
      const d = await ddgInstant(q);
      if (d.answer && d.answer.length > 8) { answer = d.answer; sources = d.sources; }
    } catch {}

    // 2) Wikipedia (summary + infobox)
    if (!answer || answer.length < 24) {
      try {
        const w = await wikipediaAnswer(q);
        if (w.answer) { answer = w.answer; sources = w.sources; }
      } catch {}
    }

    if (!answer) return res.status(404).json({ q, answer: "", sources: [], note: "No direct answer found" });

    // 3) Compress to a clean one-liner (don’t overwrite with the guard sentence)
    let final = "";
    try { final = await extractOneLine(q, answer); } catch {}
    if (final && !/i don[’']t have that from the sources/i.test(final)) {
      return res.json({ q, answer: final, sources });
    }
    res.json({ q, answer, sources });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// =================== PR Autopilot ===================
// POST /api/self/pr  { "task": "short description" }
app.post('/api/self/pr', async (req, res) => {
  try {
    if (!process.env.GITHUB_TOKEN || !GITHUB_REPO) {
      return res.status(400).json({ error: "Missing GITHUB_TOKEN or GITHUB_REPO" });
    }
    const task = (req.body?.task || "").toString().trim();
    if (!task) return res.status(400).json({ error: "Missing 'task' in body" });

    // 1) Ask the model for a minimal, safe change (Markdown plan)
    const propose = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: "Create a minimal, safe change that moves the repo toward the task. Output a concise Markdown file (200–400 words) with any small code snippets. Write under docs/autopilot/ only." },
        { role: "user", content: `Task: ${task}\n\nWrite the Markdown now.` }
      ],
    });
    const md = propose.choices[0].message.content || "# Autopilot\n\n(No content)";

    // 2) Write file
    const stamp = new Date().toISOString().replace(/[:.]/g,'-');
    const relPath = `docs/autopilot/${stamp}.md`;
    const absPath = path.join(repoRoot, relPath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, md, 'utf8');

    // 3) Branch, commit, push
    const branch = `autopilot/${stamp}`;
    const authorName = process.env.GIT_AUTHOR_NAME || "RamRoot Bot";
    the_authorEmail = process.env.GIT_AUTHOR_EMAIL || "bot@ramroot.local";
    run(`git checkout -b "${branch}"`);
    run(`git add "${relPath}"`);
    run(`git -c user.name="${authorName}" -c user.email="${the_authorEmail}" commit -m "autopilot: ${task}"`);
    run(`git push -u origin "${branch}"`);

    // 4) Open PR
    const pr = await octokit.pulls.create({
      owner: OWNER, repo: REPO,
      title: `autopilot: ${task}`,
      head: branch, base: "main",
      body: `Task: ${task}\n\nGenerated: \`${relPath}\``
    });

    res.json({ ok: true, branch, pr: pr.data.html_url, file: relPath });
  } catch (e) {
    console.error("autopilot PR error:", e.toString());
    res.status(500).json({ error: e.message || String(e) });
  } finally {
    try { run('git checkout -'); } catch {}
  }
});

// =================== Health & Root ===================
app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok', time: new Date().toISOString() }));
app.get('/', (req, res) => res.send('✅ RamRoot backend is running successfully.'));

app.listen(port, () => {
  console.log(`✅ RamRoot backend running on http://localhost:${port}`);
});
