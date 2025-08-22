// server/routes/relevance.cjs
const express = require('express');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

const router = express.Router();
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Model & on-disk index location
const EMB_MODEL = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';
const INDEX_PATH = path.join(__dirname, '..', 'files', 'relevance-index.json');

// ---------- helpers ----------
function walk(dir, pick) {
  const out = [];
  const q = [dir];
  while (q.length) {
    const d = q.pop();
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) q.push(p);
      else if (pick(p)) out.push(p);
    }
  }
  return out;
}

function chunk(text, size = 900) {
  const words = text.split(/\s+/);
  const parts = [];
  for (let i = 0; i < words.length; i += size) {
    parts.push(words.slice(i, i + size).join(' '));
  }
  return parts;
}

function loadIndex() {
  try { return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8')); }
  catch { return { vectors: [] }; }
}

function saveIndex(idx) {
  fs.mkdirSync(path.dirname(INDEX_PATH), { recursive: true });
  fs.writeFileSync(INDEX_PATH, JSON.stringify(idx));
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

// ---------- routes ----------
/**
 * POST /api/relevance/ingest
 * Walks the repo, chunks text files, embeds them, and writes an index.
 */
router.post('/ingest', async (_req, res) => {
  const roots = [
    path.join(process.cwd(), 'docs'),
    path.join(process.cwd(), 'README.md'),
    path.join(process.cwd(), 'src'),
    path.join(process.cwd(), 'server'),
    path.join(process.cwd(), 'server', 'public', 'memory.json'), // include your memory
  ];

  // Collect files
  const files = [];
  for (const r of roots) {
    if (!fs.existsSync(r)) continue;
    const st = fs.statSync(r);
    if (st.isFile()) files.push(r);
    else {
      files.push(
        ...walk(r, (fp) =>
          /\.(md|mdx|txt|js|jsx|ts|tsx|cjs|mjs)$/.test(fp) ||
          /memory\.json$/.test(fp)
        )
      );
    }
  }

  const idx = { vectors: [] };

  // Serial embed to keep it simple and avoid rate limits
  for (const f of files) {
    let text = '';
    try { text = fs.readFileSync(f, 'utf8'); }
    catch { continue; }

    // light cleanup for JSON
    if (f.endsWith('.json')) {
      try { text = JSON.stringify(JSON.parse(text), null, 2); } catch {}
    }

    const chunks = chunk(text);
    for (const c of chunks) {
      try {
        const emb = await client.embeddings.create({ model: EMB_MODEL, input: c });
        idx.vectors.push({
          vec: emb.data[0].embedding,
          source: path.relative(process.cwd(), f),
          chunk: c.slice(0, 2000)
        });
      } catch (e) {
        // skip on embed error, continue
        console.error('embed error:', e.message);
      }
    }
  }

  saveIndex(idx);
  res.json({ indexed: idx.vectors.length, files: files.length });
});

/**
 * GET /api/relevance/search?q=&k=
 * Returns top-K matching passages from the local index.
 */
router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const k = Math.max(1, Math.min(10, Number(req.query.k || 6)));
  if (!q) return res.json({ hits: [] });

  const idx = loadIndex();
  if (!idx.vectors.length) return res.json({ hits: [] });

  let qv;
  try {
    const emb = await client.embeddings.create({ model: EMB_MODEL, input: q });
    qv = emb.data[0].embedding;
  } catch (e) {
    return res.status(500).json({ error: 'embed_failed', message: e.message });
  }

  const hits = idx.vectors
    .map(v => ({ score: cosine(qv, v.vec), source: v.source, chunk: v.chunk }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);

  res.json({ hits });
});

module.exports = router;
