const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

function readText(relPath) {
  const p = path.join(process.cwd(), relPath.replace(/^[\/\\]/,''));
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
}

function extractFencedJSON(text) {
  // Prefer ```json ... ```
  let m = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (!m) {
    // fallback: any fenced block that looks like a JSON object
    m = text.match(/```\s*({[\s\S]*?})\s*```/);
  }
  if (m && m[1]) {
    try { return JSON.parse(m[1]); } catch {}
  }
  // final fallback: raw JSON in the file
  try { return JSON.parse(text.trim()); } catch {}
  return null;
}

router.post('/', (req, res) => {
  const files = Array.isArray(req.body?.files) ? req.body.files : [];
  for (const f of files) {
    const txt = readText(f);
    if (!txt) continue;
    const obj = extractFencedJSON(txt);
    if (obj) {
      return res.status(200).type('application/json; charset=utf-8').send(obj);
    }
  }
  return res.status(200).type('application/json; charset=utf-8').send({ key_points: 'MISSING' });
});

module.exports = router;
