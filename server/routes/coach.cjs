// server/routes/coach.cjs
const express = require('express');
const OpenAI = require('openai');
const { memoryContext } = require('../engine/memory.cjs');

const router = express.Router();
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function baseURL() {
  const port = process.env.PORT || '5000';
  return `http://localhost:${port}`;
}

router.post('/', async (req, res) => {
  try {
    const request = String(req.body?.request || '').trim();
    if (!request) return res.status(400).json({ error: 'empty_request' });

    const sys = `You are RamRoot's COACH. Reply with ONLY JSON using this schema:
{
  "plan": ["step 1", "step 2"],
  "files_to_touch": [{"path":"src/...","purpose":"why"}],
  "acceptance_criteria": ["observable check"]
}`;

    const mem = memoryContext();

    // pull top-K repo context from Relevance (if indexed)
    let context = '';
    try {
      const hits = await fetch(`${baseURL()}/api/relevance/search?q=${encodeURIComponent(request)}&k=6`).then(r => r.json());
      context = (hits.hits || []).map(h => `[${h.source}] ${h.chunk}`).join('\n---\n');
    } catch {}

    const out = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.2,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: `${mem}\n\nContext from repo:\n${context}\n\nUser request: ${request}` }
      ]
    });

    const text = out.choices?.[0]?.message?.content || '{}';
    let json;
    try { json = JSON.parse(text); }
    catch { json = { plan: ["Parse error"], raw: text }; }

    res.json(json);
  } catch (e) {
    console.error('coach error', e);
    res.status(500).json({ error: 'coach_failed', message: String(e?.message || e) });
  }
});

module.exports = router;
