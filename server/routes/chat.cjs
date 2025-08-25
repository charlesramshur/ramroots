const express = require("express");
const OpenAI  = require("openai");
const { memoryContext, rememberFacts } = require("../engine/memory.cjs");

const router = express.Router();
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL  = process.env.OPENAI_MODEL || "gpt-4o-mini";

function baseURL () {
  const port = process.env.PORT || "5000";
  return "http://localhost:" + port;
}

async function fetchRelevance(q, k = 6, timeoutMs = 2000) {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const url = baseURL() + "/api/relevance/search?q=" + encodeURIComponent(q) + "&k=" + k;
    const r = await fetch(url, { signal: ctl.signal });
    clearTimeout(timer);
    if (!r.ok) return [];
    const j = await r.json();
    const hits = Array.isArray(j.hits) ? j.hits : [];
    return hits.slice(0, k).map(h => ({
      source: h.source || h.path || "?",
      chunk: String(h.chunk || "")
    }));
  } catch {
    return [];
  }
}

router.post("/", async (req, res) => {
  try {
    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "empty_text" });

    // 1) Load short-term memory
    const mem = memoryContext();
    const memFacts = (mem.facts || []).map(f => `- [${f.type}] ${f.value}`).join("\n");

    // 2) Pull top-k repo snippets
    const hits = await fetchRelevance(text, 6);
    let budget = 1600; // crude token/char budget for retrieved context
    const ctxParts = [];
    for (const h of hits) {
      const snip = h.chunk.replace(/\s+/g, " ");
      const take = snip.slice(0, Math.min(budget, 400));
      if (!take) break;
      ctxParts.push(`SOURCE: ${h.source}\n${take}`);
      budget -= take.length;
      if (budget <= 0) break;
    }
    const retrieved = ctxParts.join("\n---\n");

    // 3) Build prompt
    const sys = [
      "You are RamRoot. Be concise and helpful.",
      "Use Memory Facts and Retrieved Context if relevant.",
      "If the answer is not present, say you don't know briefly."
    ].join(" ");

    const user = [
      "### Memory Facts (recent)",
      memFacts || "(none)",
      "",
      "### Retrieved Context (top matches)",
      retrieved || "(none)",
      "",
      "### Question",
      text
    ].join("\n");

    // 4) Ask the model
    const out = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: sys },
        { role: "user",   content: user }
      ]
    });

    const reply = out?.choices?.[0]?.message?.content?.trim() || "";

    // 5) Log the turn into memory
    if (reply) {
      rememberFacts([
        { type: "user",      value: text },
        { type: "assistant", value: reply }
      ]);
    }

    res.json({ reply, model: MODEL, retrieved_count: hits.length });
  } catch (e) {
    console.error("chat error", e);
    res.status(500).json({ error: "chat_failed", message: String(e?.message || e) });
  }
});

module.exports = router;
