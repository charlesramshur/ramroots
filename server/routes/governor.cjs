const express = require('express');
const router = express.Router();
function baseURL(){ const port=process.env.PORT||'5000'; return http://localhost:; }

router.post('/approve', async (req,res)=>{
  try{
    const request = String(req.body?.request||'').trim();
    if(!request) return res.status(400).json({ error:'empty_request' });
    const pr = await fetch(${baseURL()}/api/builder/propose, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ request })
    }).then(r=>r.json());
    return res.json(pr);
  }catch(e){ console.error('governor approve error', e); res.status(500).json({ error:'governor_failed', message:String(e?.message||e) }); }
});

module.exports = router;
