"use strict";
const express = require("express");
const router = express.Router();

let fetchFn = global.fetch;
try { if (!fetchFn) fetchFn = require("node-fetch"); } catch {}
const fetch = fetchFn;

async function googleSearch(q, num = 5) {
  // Read env at request time
  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || process.env.GOOGLE_SEARCH_KEY || "";
  const GOOGLE_CSE_ID  = process.env.GOOGLE_CSE_ID  || process.env.GOOGLE_CX        || "";

  if (!GOOGLE_API_KEY || !GOOGLE_CSE_ID) {
    return { error: "missing_keys", items: [], info: { haveKey: !!GOOGLE_API_KEY, haveCx: !!GOOGLE_CSE_ID } };
  }

  const n = Math.max(1, Math.min(Number(num) || 5, 10));
  const url = "https://www.googleapis.com/customsearch/v1"
    + "?key=" + encodeURIComponent(GOOGLE_API_KEY)
    + "&cx="  + encodeURIComponent(GOOGLE_CSE_ID)
    + "&q="   + encodeURIComponent(q)
    + "&num=" + n;

  const r = await fetch(url);
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`google ${r.status} ${text.slice(0,200)}`);
  }
  const j = await r.json();
  const items = Array.isArray(j.items) ? j.items.map(i => ({
    title: i.title, link: i.link, snippet: (i.snippet || "").trim()
  })) : [];
  return { items };
}

router.get("/web/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const n = parseInt(req.query.n, 10) || 5;
    if (!q) return res.status(400).json({ error: "empty_q" });
    const out = await googleSearch(q, n);
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: "search_failed", message: String(e.message || e) });
  }
});

module.exports = router;
