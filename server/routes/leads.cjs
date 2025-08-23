const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();
function _adm(req,res,next){ const tok = process.env.ADMIN_TOKEN || ""; if (tok && req.get("x-admin-token") !== tok) return res.status(401).json({ ok:false, error:"unauthorized" }); next(); }
router.use("/self", _adm);
const LEADS_PATH = path.join(process.cwd(),"server","files","leads.json");
function readLeads(){ try{ return JSON.parse(fs.readFileSync(LEADS_PATH,"utf8")); } catch{ return []; } }
function writeLeads(a){ fs.mkdirSync(path.dirname(LEADS_PATH), { recursive:true }); fs.writeFileSync(LEADS_PATH, JSON.stringify(a,null,2)); }
router.post("/leads",(req,res)=>{ try{ const { email, name, note } = req.body || {}; if(!email) return res.status(400).json({ ok:false, error:"email_required" }); const id = Date.now().toString(36); const createdAt = new Date().toISOString(); const rec = { id, email, name, note, createdAt }; const arr = readLeads(); arr.push(rec); writeLeads(arr); res.json({ ok:true, id, createdAt }); } catch(e){ res.status(500).json({ ok:false, error:String(e?.message||e)}); } });
router.get("/self/leads",(req,res)=>{ const arr = readLeads().sort((a,b)=> String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,50); res.json(arr); });
router.get("/self/leads.csv", (_req,res) => {
  const arr = readLeads()
    .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))))
    .slice(0,500);
  const q = s => '"' + String(s ?? '').replace(/"/g,'""') + '"';
  const lines = ["id,email,name,note,createdAt",
    ...arr.map(x => [x.id,x.email,x.name,x.note,x.createdAt].map(q).join(","))];
  res.type("text/csv").send(lines.join("\n"));
});
router.get('/self/leads.csv', (req,res) => {
  const arr = readLeads()
    .sort((a,b)=> String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0,50);
  const q = s => '"' + String(s ?? '').replace(/"/g,'""') + '"';
  const lines = ['id,email,name,note,createdAt',
    ...arr.map(x => [x.id,x.email,x.name,x.note,x.createdAt].map(q).join(','))];
  res.type('text/csv').send(lines.join('\n'));
});
router.get('/self/leads.csv', (_req, res) => {
  const arr = readLeads()
    .sort((a,b)=> String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0,50);
  const q = s => '"' + String(s ?? '').replace(/"/g,'""') + '"';
  const lines = ['id,email,name,note,createdAt',
    ...arr.map(x => [x.id,x.email,x.name,x.note,x.createdAt].map(q).join(','))];
  res.type('text/csv').send(lines.join('\n'));
});
module.exports = router;
