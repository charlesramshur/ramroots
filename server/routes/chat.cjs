// routes/chat.cjs
// RamRoot v0.1.0 — clean RAG chat route (single file, drop-in)
// Endpoint: POST /api/chat
// Body: { message: string, history?: [{role, content}], k?: number, user_id?: string, temperature?: number, max_tokens?: number }

"use strict";

const express = require("express");
const router = express.Router();
const OpenAI = require("openai");
const { memoryContext } = require("../engine/memory.cjs");
let readMemory = null; try { ({ readMemory } = require("../memorymanager.cjs")); } catch {}

// ---- OpenAI client ----
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// ---- fetch fallback (Node 18+ has global fetch) ----
let fetchFn = global.fetch;
if (!fetchFn) {
  try { fetchFn = require("node-fetch"); } catch { /* optional */ }
}
const fetch = fetchFn;

// ---- helpers ----
function baseURL () {
  const port = process.env.PORT || "5000";
  return "http://localhost:" + port;
}

async function fetchRelevance(q, k = 6) {
  if (!fetch) return [];
  try {
    const url = baseURL() + "/api/relevance/search?q=" + encodeURIComponent(q) + "&k=" + encodeURIComponent(k);
    const r = await fetch(url);
    if (!r.ok) return [];
    const j = await r.json();
    const hits = Array.isArray(j?.hits) ? j.hits : (Array.isArray(j) ? j : []);
    return hits;
  } catch {
    return [];
  }
}

function pickText(hit) {
  return hit?.text || hit?.chunk || hit?.content || hit?.body || "";
}

function makeContext(hits, budgetChars = 7500) {
  if (!Array.isArray(hits) || hits.length === 0) return "";
  const rows = [];
  let used = 0;
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i] || {};
    const tag = h.source || h.title || h.id || `S${i+1}`;
    const score = (typeof h.score === "number") ? ` score=${h.score.toFixed(3)}` : "";
    const text = String(pickText(h) || "").trim();
    if (!text) continue;
    const chunk = `[[${tag}${score}]]\n${text}\n`;
    if (used + chunk.length > budgetChars) break;
    rows.push(chunk);
    used += chunk.length;
  }
  return rows.length ? `— BEGIN CONTEXT —\n${rows.join("\n")}\n— END CONTEXT —` : "";
}

function normalizeHistory(history, maxTurns = 8, maxEachChars = 1200) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-maxTurns)
    .map(m => ({ role: m.role, content: (m.content || "").slice(0, maxEachChars) }));
}

// System prompt pulls from your memory layer if present:
function systemPrompt(userId) {
  const mem = (typeof memoryContext === "function") ? memoryContext(userId) : null;
  const base = [
    "You are RamRoot — a practical, no-bullshit assistant built to help Charles get real work done.",
    "When context is provided, reason from it first. If context is thin, say so briefly and continue.",
    "Cite context snippets inline as [[TAG]] where TAG comes from the context headers.",
    "Be concise unless the user explicitly asks for exhaustive detail."
  ].join(" ");
  if (!mem) return base;
  const memStr = (typeof mem === "string") ? mem : JSON.stringify(mem);
  return `${base}\n\n[Memory]\n${memStr}`;
}

// ---- Route ----
router.post("/chat", async (req, res) => {
  // BEGIN web: inline hook
const __rawMessage = String((req.body && req.body.message) || "").trim();
if (/^\s*(web|search)\s*:/i.test(__rawMessage)) {
  const q = __rawMessage.replace(/^\s*(web|search)\s*:/i, "").trim();
  try {
    const origin = (req.protocol || 'http') + '://' + req.get('host');
    const r = await fetch(origin + "/api/web/search?q=" + encodeURIComponent(q) + "&n=5");
    const j = await r.json();
    const items = Array.isArray(j.items) ? j.items : [];
    const answer = items.length
      ? items.map((it,i)=> `${i + 1}. ${it.title} - ${it.link}`).join("\n")
      : "No results.";
    return res.json({ ok: true, model: (typeof MODEL !== 'undefined' ? MODEL : 'web'), answer, hits: items });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "web_search_failed", message: String(e.message || e) });
  }
}
// END web: inline hook

  const started = Date.now();
  try {
    const {
      message,
      q,                // alias for message if client still sends q
      user_id,
      history,
      k,
      temperature,
      max_tokens
    } = (req.body || {});

    const userMessage = (typeof message === "string" && message.trim())
      ? message.trim()
      : (typeof q === "string" ? q.trim() : "");

    if (!userMessage) {
      return res.status(400).json({ ok: false, error: "Missing 'message' (or 'q') in body." });
    }

    // 1) Retrieve relevance hits
    const kEff = Number.isFinite(k) ? Math.max(1, Math.min(12, k|0)) : 6;
    const hits = await fetchRelevance(userMessage, kEff);

    // 2) Build context & messages
    const mem = (typeof readMemory === "function") ? readMemory({ sandbox: false }) : ((typeof memoryContext === "function") ? memoryContext(user_id) : null);
const mHit = mem ? memoryBlock(mem) : null;
const ctx = makeContext([].concat(mHit ? [mHit] : []).concat(hits));
    const sys = systemPrompt(user_id);
    const recent = normalizeHistory(history);
    const ragInstruction = ctx
      ? `Use the following context to answer. If something isn't covered, say so briefly and proceed.\n\n${ctx}`
      : `No external context was supplied for this question. Answer from general knowledge and be clear about limits if any.`;

    const messages = [
      { role: "system", content: sys },
      ...recent,
      { role: "user", content: `${ragInstruction}\n\n[Question]\n${userMessage}` }
    ];

    // 3) Call OpenAI
    const resp = await client.chat.completions.create({
      model: MODEL, max_completion_tokens:  Number.isFinite(max_tokens) ? max_completion_tokens:  600,
      messages
    });

    const choice = resp?.choices?.[0];
    const answer = choice?.message?.content || "";

    // 4) Reply JSON
    return res.json({
      ok: true,
      model: resp?.model || MODEL,
      answer,
      hits,                               // echo what we used for client-side debugging/UX
      usage: resp?.usage || null,
      latency_ms: Date.now() - started
    });

  } catch (err) {
    console.error("POST /api/chat error:", err);
    return res.status(500).json({
      ok: false,
      error: "chat_failed",
      message: (err && (err.message || err.toString())) || "Unknown error"
    });
  }
});
function memoryBlock(mem, budget=1200) {
  try {
    const list = []
      .concat(mem?.notes || [])
      .concat(mem?.goals || [])
      .concat(mem?.features || [])
      .concat(mem?.facts || [])
      .map(x => typeof x === "string" ? x : (x.text || x.value || ""))
      .filter(Boolean);
    if (!list.length) return null;
    const txt = list.join("\n").slice(0, budget);
    return { source: "MEMORY", text: txt, score: 1.0 };
  } catch { return null; }
}
module.exports = router;











