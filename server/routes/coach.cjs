const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const { memoryContext } = require('../engine/memory.cjs');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
function baseURL(){ const port=process.env.PORT||'5000'; return http://localhost:; }

router.post('/', async (req,res)=>{
  try{
    const request = String(req.body?.request||'');
    const sys = 'You are RamRoot\\'s COACH. Reply with ONLY strict JSON using this schema:\\n{\\n  \"plan\": [\"step 1\", \"step 2\"],\\n  \"files_to_touch\": [{\"path\":\"src/...\",\"purpose\":\"why\"}],\\n  \"acceptance_criteria\": [\"observable check\"]\\n}';
    const mem = memoryContext();
    const hits = await fetch(${baseURL()}/api/relevance/search?q=&k=6).then(r=>r.json()).catch(()=>({hits:[]}));
    const context = (hits.hits||[]).map(h=>[] ).join('\\n---\\n');

    const out = await client.chat.completions.create({
      model: MODEL, temperature: 0.2,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: ${mem}\\n\\nContext from repo:\\n\\n\\nUser request:  }
      ]
    });
    const text = out.choices?.[0]?.message?.content || '{}';
    let json; try { json = JSON.parse(text); } catch { json = { plan:['Parse error'], raw:text }; }
    res.json(json);
  }catch(e){ console.error('coach error', e); res.status(500).json({ error:'coach_failed', message:String(e?.message||e) }); }
});
module.exports = router;
