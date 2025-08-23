// server/server.cjs
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// === Load env files explicitly ===
// 1) Secrets from server/.env (authoritative)
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
// 2) Root .env (only VITE_*), DO NOT override secrets
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: false });

const multer = require('multer');
const cheerio = require('cheerio');
const { execSync } = require('child_process');
const { Octokit } = require('@octokit/rest');

const {
  readMemory,
  writeMemory,
  addGoal,
  addFeature,
  addNote,
  searchMemory,
  promoteSandbox,   // sandbox helpers
  clearSandbox
} = require('./memorymanager.cjs');

const OpenAI = require("openai");

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
const triageRouter = require('./routes/triage.cjs');
const relevanceRouter = require('./routes/relevance.cjs');
const coachRouter = require('./routes/coach.cjs');
const builderRouter = require('./routes/builder.cjs');
const prsRouter = require('./routes/prs.cjs');
const leadsRouter = require('./routes/leads.cjs');

app.use('/triage', (triageRouter.default || triageRouter));
app.use('/api/relevance', relevanceRouter);
app.use('/api/coach', coachRouter);
app.use('/api/builder', builderRouter);
app.use('/api/self', prsRouter);
app.use('/api', leadsRouter);

app.get('/triage/ping', (_req, res) => res.send('pong'));

// === Files setup for FileBrowser ===
const FILES_DIR = path.join(__dirname, 'files');
if (!fs.existsSync(FILES_DIR)) fs.mkdirSync(FILES_DIR, { recursive: true });
const upload = multer({ dest: FILES_DIR });

// === OpenAI client ===
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Helper (used by chat shortcuts)
function baseURL() {
  return `http://localhost:${port}`;
}

// === GitHub client + helpers for PR autopilot ===
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const GITHUB_REPO = process.env.GITHUB_REPO || ""; // "owner/name"
const [OWNER, REPO] = (GITHUB_REPO || "").split('/');
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
function useSandbox(req) {
  const v = String(req.query?.sandbox ?? '').toLowerCase();
  return v === '1' || v === 'true';
}

app.get('/api/memory', (req, res) => {
  const sandbox = useSandbox(req);
  res.json(readMemory({ sandbox }));
});

app.get('/api/memory/search', (req, res) => {
  const keyword = req.query.keyword;
  if (!keyword) return res.status(400).json({ error: 'Keyword is required' });
  const sandbox = useSandbox(req);
  res.json(searchMemory(keyword, { sandbox }));
});

app.post('/api/memory/goals', (req, res) => {
  const goal = req.body;
  if (!goal?.text) return res.status(400).json({ error: 'Goal must have text' });
  const sandbox = useSandbox(req);
  addGoal(goal, { sandbox });
  res.status(201).json({ success: true, sandbox });
});

app.post('/api/memory/features', (req, res) => {
  const feature = req.body;
  if (!feature?.text) return res.status(400).json({ error: 'Feature must have text' });
  const sandbox = useSandbox(req);
  addFeature(feature, { sandbox });
  res.status(201).json({ success: true, sandbox });
});

app.post('/api/memory/notes', (req, res) => {
  const note = req.body;
  if (!note?.text) return res.status(400).json({ error: 'Note must have text' });
  const sandbox = useSandbox(req);
  addNote(note, { sandbox });
  res.status(201).json({ success: true, sandbox });
});

// Promote sandbox → live
app.post('/api/memory/sandbox/promote', (_req, res) => {
  const r = promoteSandbox();
  if (!r.ok) return res.status(400).json(r);
  res.json({ ok: true });
});

// Clear sandbox file
app.post('/api/memory/sandbox/clear', (_req, res) => {
  const r = clearSandbox();
  if (!r.ok) return res.status(400).json(r);
  res.json({ ok: true });
});

// =================== Chat API (with shortcuts) ===================
app.post('/api/ask', async (req, res) => {
  try {
    const raw = String(req.body?.prompt || '').trim();
    if (!raw) return res.status(400).json({ error: 'missing_prompt' });

    // Shortcuts:
    // coach: <request>    -> POST /api/coach
    // build: <request>    -> POST /api/builder/propose
    // merge: <prNumber>   -> POST /api/self/merge
    const mCoach  = raw.match(/^coach:\s*(.+)$/i);
    const mBuild  = raw.match(/^build(?:er)?:\s*(.+)$/i);
    const mMerge  = raw.match(/^merge:\s*(\d+)\s*$/i);

    if (mCoach) {
      const body = { request: mCoach[1] };
      const r = await fetch(`${baseURL()}/api/coach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then(x => x.json());
      return res.json({ type: 'coach', result: r });
    }

    if (mBuild) {
      const body = { request: mBuild[1] };
      const r = await fetch(`${baseURL()}/api/builder/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then(x => x.json());
      return res.json({ type: 'builder', pr_number: r.pr_number, pr_url: r.pr_url, branch: r.branch });
    }

    if (mMerge) {
      const body = { number: Number(mMerge[1]) };
      const r = await fetch(`${baseURL()}/api/self/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then(x => x.json());
      return res.json({ type: 'merge', result: r });
    }

    // Default: model chat with recent memory
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
      { role: "user", content: raw }
    ];

    const completion = await openai.chat.completions.create({ model: "gpt-4o", messages });
    res.json({ reply: completion.choices[0].message.content });
  } catch (error) {
    console.error('❌ /api/ask error:', error.message);
    res.status(500).json({ error: "ask_error", message: error.message });
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
    const authorEmail = process.env.GIT_AUTHOR_EMAIL || "bot@ramroot.local";

    run(`git checkout -b "${branch}"`);
    run(`git add "${relPath}"`);
    const msg = `autopilot: ${task}`.replace(/"/g, '\\"');

    run(`git -c user.name="${authorName}" -c user.email="${authorEmail}" commit -m "${msg}"`);
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

// =================== PR Autopilot: safe file edit ===================
// POST /api/self/edit
// Body: { "file": "src/pages/Chat.jsx", "find": "old", "replace": "new", "message": "short title" }
app.post('/api/self/edit', async (req, res) => {
  try {
    if (!process.env.GITHUB_TOKEN || !GITHUB_REPO) {
      return res.status(400).json({ error: "Missing GITHUB_TOKEN or " +
        "GITHUB_REPO" });
    }

    const fileRel = (req.body?.file || "").toString().trim();
    const find = (req.body?.find || "").toString();
    const replace = (req.body?.replace || "").toString();
    const message = (req.body?.message || "").toString().trim() || `autopilot edit: ${fileRel}`;

    if (!fileRel || !find) {
      return res.status(400).json({ error: "Missing 'file' or 'find' in body" });
    }

    // Safety: only allow edits inside the repo and within a whitelist of folders/exts
    const allowedDirs = ['src', 'server', 'docs', 'public'];
    const allowedExts = ['.js', '.jsx', '.cjs', '.ts', '.tsx', '.css', '.md', '.json'];
    const abs = path.normalize(path.join(repoRoot, fileRel));
    if (!abs.startsWith(repoRoot + path.sep)) {
      return res.status(400).json({ error: "Path escapes repository" });
    }
    const relParts = fileRel.split(/[\\/]/);
    if (!allowedDirs.includes(relParts[0])) {
      return res.status(400).json({ error: "Editing this folder is not allowed" });
    }
    if (!allowedExts.includes(path.extname(fileRel))) {
      return res.status(400).json({ error: "Editing this file type is not allowed" });
    }
    if (!fs.existsSync(abs)) {
      return res.status(404).json({ error: "File not found" });
    }

    // Read & apply replacement (literal replace of first occurrence)
    let text = fs.readFileSync(abs, 'utf8');
    if (!text.includes(find)) {
      return res.status(400).json({ error: "The 'find' text was not found in the file" });
    }
    const newText = text.replace(find, replace);
    if (newText === text) {
      return res.status(400).json({ error: "No change produced" });
    }
    fs.writeFileSync(abs, newText, 'utf8');

    // Branch, commit, push, PR
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const branch = `edit/${stamp}`;

    const authorName = process.env.GIT_AUTHOR_NAME || "RamRoot Bot";
    const authorEmail = process.env.GIT_AUTHOR_EMAIL || "bot@ramroot.local";

    run(`git checkout -b "${branch}"`);
    run(`git add "${fileRel}"`);
    run(`git -c user.name="${authorName}" -c user.email="${authorEmail}" commit -m "${message.replace(/"/g, '\\"')}"`);
    run(`git push -u origin "${branch}"`);

    const pr = await octokit.pulls.create({
      owner: OWNER, repo: REPO,
      title: message,
      head: branch, base: "main",
      body: `Edited \`${fileRel}\`\n\n• find: \`${find}\`\n• replace: \`${replace}\``
    });

    res.json({ ok: true, branch, pr: pr.data.html_url, file: fileRel });
  } catch (e) {
    console.error("autopilot EDIT error:", e.toString());
    res.status(500).json({ error: e.message || String(e) });
  } finally {
    try { run('git checkout -'); } catch {}
  }
});

// =================== PR Autopilot: merge a PR (force-try) ===================
// POST /api/self/merge  { "number": 12 }
app.post('/api/self/merge', async (req, res) => {
  try {
    if (!process.env.GITHUB_TOKEN || !GITHUB_REPO) {
      return res.status(400).json({ error: "Missing GITHUB_TOKEN or GITHUB_REPO" });
    }
    const prNum = Number(req.body?.number || req.body?.pr || req.query?.number);
    if (!prNum) return res.status(400).json({ error: "Missing PR number" });

    // fetch PR to get head branch
    let prInfo = await octokit.pulls.get({ owner: OWNER, repo: REPO, pull_number: prNum });
    const headRef = prInfo.data.head.ref;

    // allow merge when not obviously blocked
    const OK_STATES = new Set(['clean', 'unstable', 'unknown', 'behind']);
    const BAD_STATES = new Set(['dirty', 'blocked']);
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    let mergeable = prInfo.data.mergeable;              // true | false | null
    let state = prInfo.data.mergeable_state;            // 'clean','dirty','blocked','behind','unknown','unstable', etc.

    // Wait up to ~90s for GitHub to compute; bail early only on hard blocks
    for (let i = 0; i < 30; i++) {
      if (prInfo.data.draft) {
        return res.status(400).json({ error: "PR is draft; mark ready for review first." });
      }
      if (BAD_STATES.has(state)) {
        return res.status(400).json({ error: "PR not mergeable", mergeable, state });
      }
      if (mergeable === true && OK_STATES.has(state)) break; // ideal case
      await sleep(3000);
      prInfo = await octokit.pulls.get({ owner: OWNER, repo: REPO, pull_number: prNum });
      mergeable = prInfo.data.mergeable;
      state = prInfo.data.mergeable_state;
    }

    // Force-try merge unless we know it's hard-blocked or draft
    try {
      await octokit.pulls.merge({
        owner: OWNER,
        repo: REPO,
        pull_number: prNum,
        merge_method: 'squash'
      });
      // best-effort: delete branch after merge
      try {
        await octokit.git.deleteRef({ owner: OWNER, repo: REPO, ref: `heads/${headRef}` });
      } catch {}
      return res.json({ ok: true, merged: true, number: prNum, branch: headRef, url: prInfo.data.html_url, state, mergeable });
    } catch (e) {
      return res.status(400).json({
        error: "Merge failed",
        mergeable,
        state,
        message: e?.response?.data?.message || e.message || String(e)
      });
    }
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

// =================== PR diagnostics & update ===================
// POST /api/self/pr-status  { "number": 16 }
app.post('/api/self/pr-status', async (req, res) => {
  try {
    if (!process.env.GITHUB_TOKEN || !GITHUB_REPO) {
      return res.status(400).json({ error: "Missing GITHUB_TOKEN or GITHUB_REPO" });
    }
    const prNum = Number(req.body?.number || req.query?.number);
    if (!prNum) return res.status(400).json({ error: "Missing PR number" });

    const pr = await octokit.pulls.get({ owner: OWNER, repo: REPO, pull_number: prNum });
    const headSha = pr.data.head.sha;

    // Reviews
    let approvals = 0, reviewsRaw = [];
    try {
      const reviews = await octokit.pulls.listReviews({ owner: OWNER, repo: REPO, pull_number: prNum });
      approvals = reviews.data.filter(r => r.state === 'APPROVED').length;
      reviewsRaw = reviews.data.map(r => ({ user: r.user?.login, state: r.state }));
    } catch {}

    // Checks API
    let checks = [];
    try {
      const cr = await octokit.checks.listForRef({ owner: OWNER, repo: REPO, ref: headSha });
      checks = cr.data.check_runs.map(r => ({ name: r.name, status: r.status, conclusion: r.conclusion }));
    } catch {}

    // Commit Statuses (legacy)
    let statuses = [];
    try {
      const st = await octokit.repos.getCombinedStatusForRef({ owner: OWNER, repo: REPO, ref: headSha });
      statuses = st.data.statuses.map(s => ({ context: s.context, state: s.state }));
    } catch {}

    return res.json({
      number: prNum,
      draft: pr.data.draft,
      mergeable: pr.data.mergeable,             // true | false | null
      mergeable_state: pr.data.mergeable_state, // 'clean','blocked','behind','dirty','unstable','unknown',...
      required_reviewers: (pr.data.requested_reviewers || []).map(u => u.login),
      approvals,
      checks,
      statuses,
      reviews: reviewsRaw
    });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

// POST /api/self/update-branch  { "number": 16 }
app.post('/api/self/update-branch', async (req, res) => {
  try {
    if (!process.env.GITHUB_TOKEN || !GITHUB_REPO) {
      return res.status(400).json({ error: "Missing GITHUB_TOKEN or GITHUB_REPO" });
    }
    const prNum = Number(req.body?.number || req.query?.number);
    if (!prNum) return res.status(400).json({ error: "Missing PR number" });

    const r = await octokit.pulls.updateBranch({ owner: OWNER, repo: REPO, pull_number: prNum }).catch(e => e);
    if (r?.status === 202 || r?.status === 200) {
      return res.json({ ok: true, status: r.status });
    }
    return res.status(400).json({ ok: false, message: r?.message || r?.response?.data?.message || 'updateBranch failed' });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

// POST /api/self/merge-main  { "number": 16, "strategy": "ours" | "theirs" }
app.post('/api/self/merge-main', async (req, res) => {
  try {
    if (!process.env.GITHUB_TOKEN || !GITHUB_REPO) {
      return res.status(400).json({ error: "Missing GITHUB_TOKEN or GITHUB_REPO" });
    }
    const prNum = Number(req.body?.number || req.query?.number);
    if (!prNum) return res.status(400).json({ error: "Missing PR number" });

    const pr = await octokit.pulls.get({ owner: OWNER, repo: REPO, pull_number: prNum });
    const head = pr.data.head.ref;   // PR branch
    const base = pr.data.base.ref;   // usually "main"
    const strategy = (String(req.body?.strategy || 'ours').toLowerCase() === 'theirs') ? 'theirs' : 'ours';

    // Bring main into the PR branch, preferring PR side on conflicts by default (-X ours)
    run(`git fetch origin`);
    run(`git checkout "${head}"`);
    try {
      run(`git merge --no-edit -X ${strategy} origin/${base}`);
    } catch (e) {
      try { run(`git merge --abort`); } catch {}
      return res.status(400).json({ ok: false, error: 'merge_conflicts', message: e.message });
    }
    run(`git push origin "${head}"`);
    return res.json({ ok: true, head, base, strategy });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  } finally {
    try { run(`git checkout -`); } catch {}
  }
});

// =================== Branch protection (approvals count) ===================
// POST /api/self/protection-set-approvals  { "branch": "main", "count": 0 }
app.post('/api/self/protection-set-approvals', async (req, res) => {
  try {
    if (!process.env.GITHUB_TOKEN || !GITHUB_REPO) {
      return res.status(400).json({ error: "Missing GITHUB_TOKEN or GITHUB_REPO" });
    }
    const branch = String(req.body?.branch || req.query?.branch || 'main');
    const count = Number(req.body?.count ?? 0);

    const r = await octokit.repos.updatePullRequestReviewProtection({
      owner: OWNER,
      repo: REPO,
      branch,
      required_approving_review_count: count,
      dismiss_stale_reviews: false,
      require_code_owner_reviews: false,
      bypass_pull_request_allowances: { users: [], teams: [], apps: [] }
    });

    return res.json({
      ok: true,
      branch,
      required_approving_review_count: r.data?.required_approving_review_count ?? count
    });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e?.response?.data?.message || e.message || String(e) });
  }
});

// =================== ADMIN squash-merge (local, Windows-safe) ===================
// POST /api/self/admin-squash-merge  { "number": 16 }
app.post('/api/self/admin-squash-merge', async (req, res) => {
  try {
    if (!process.env.GITHUB_TOKEN || !GITHUB_REPO) {
      return res.status(400).json({ error: "Missing GITHUB_TOKEN or GITHUB_REPO" });
    }
    const prNum = Number(req.body?.number || req.query?.number);
    if (!prNum) return res.status(400).json({ error: "Missing PR number" });

    // Get PR info
    const pr = await octokit.pulls.get({ owner: OWNER, repo: REPO, pull_number: prNum });
    const head = pr.data.head.ref;   // PR branch name
    const base = pr.data.base.ref;   // usually "main"
    const title = pr.data.title || `PR #${prNum}`;

    // Prepare repo
    run(`git fetch origin`);
    run(`git checkout "${base}"`);
    try { run(`git pull --ff-only origin "${base}"`); }
    catch { run(`git pull origin "${base}"`); }

    // Squash-merge PR contents into base (no merge commit, linear history preserved)
    try {
      run(`git merge --squash origin/"${head}"`);
    } catch (e) {
      try { run(`git merge --abort`); } catch {}
      return res.status(400).json({ ok: false, error: 'merge_conflicts', message: e.message });
    }

    // Stage everything explicitly (handles edge cases on Windows)
    try { run(`git add -A`); } catch {}

    // Anything staged?
    let staged = '';
    try { staged = run(`git diff --cached --name-only`).trim(); } catch {}

    const authorName = process.env.GIT_AUTHOR_NAME || "RamRoot Bot";
    const authorEmail = process.env.GIT_AUTHOR_EMAIL || "bot@ramroot.local";

    if (staged) {
      // Write commit message to a temp file to avoid quoting issues on Windows
      const msg = `admin squash-merge: ${title} (#${prNum})`;
      const tmpMsgPath = path.join(repoRoot, `.__ramroot_commit_${Date.now()}.txt`);
      try {
        fs.writeFileSync(tmpMsgPath, msg + '\n', 'utf8');
        run(`git -c user.name="${authorName}" -c user.email="${authorEmail}" commit -F "${tmpMsgPath}"`);
      } finally {
        try { fs.unlinkSync(tmpMsgPath); } catch {}
      }
    } else {
      // Nothing to commit => already included
    }

    // Push to main
    run(`git push origin "${base}"`);

    // Best-effort: close PR and delete branch
    try { await octokit.pulls.update({ owner: OWNER, repo: REPO, pull_number: prNum, state: 'closed' }); } catch {}
    try { await octokit.git.deleteRef({ owner: OWNER, repo: REPO, ref: `heads/${head}` }); } catch {}

    const headSha = run(`git rev-parse HEAD`).trim();
    return res.json({ ok: true, merged: true, method: 'squash', base, head, commit: headSha, staged: Boolean(staged) });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.response?.data?.message || e.message || String(e) });
  } finally {
    try { run(`git checkout -`); } catch {}
  }
});

// =================== Ops runner (safe allowlist) ===================
const SAFE_OPS = {
  // Quick repo status
  status: async () => {
    const branch = run('git rev-parse --abbrev-ref HEAD').trim();
    let dirtyList = '';
    try { dirtyList = run('git status --porcelain').trim(); } catch {}
    const dirty = Boolean(dirtyList);
    const changed = dirtyList ? dirtyList.split(/\r?\n/).length : 0;
    return { branch, dirty, changed };
  },

  // Build the app (optional)
  build: async () => {
    try { return run('npm run build'); }
    catch (e) { return (e.stdout?.toString() || e.message || String(e)).slice(0, 4000); }
  },
};

app.post('/api/self/ops', async (req, res) => {
  const op = (req.body?.op || '').toString().trim().toLowerCase();
  if (!op || !SAFE_OPS[op]) {
    return res.status(400).json({ error: 'Unknown op', allowed: Object.keys(SAFE_OPS) });
  }
  try {
    const result = await SAFE_OPS[op]();
    res.json({ ok: true, op, result });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

// =================== Health & Root ===================
app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok', time: new Date().toISOString() }));
app.get('/', (req, res) => res.send('✅ RamRoot backend is running successfully - Builder edit test.'));

app.listen(port, () => {
  console.log(`✅ RamRoot backend running on http://localhost:${port}`);
});
