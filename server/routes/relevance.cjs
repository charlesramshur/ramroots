const express = require('express');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const router = express.Router();

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const EMB_MODEL = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';
const INDEX_PATH = path.join(process.cwd(), 'server', 'files', 'relevance-index.json');

function walk(dir, pick){
  const out=[], q=[dir];
  while(q.length){
    const d=q.pop();
    for(const n of fs.readdirSync(d)){
      const p=path.join(d,n);
      const st=fs.statSync(p);
      if(st.isDirectory()) q.push(p);
      else if(pick(p)) out.push(p);
    }
  }
  return out;
}
function chunk(text, size=900){ const w=text.split(/\s+/); const parts=[]; for(let i=0;i<w.length;i+=size) parts.push(w.slice(i,i+size).join(' ')); return parts; }
function load(){ try{ return JSON.parse(fs.readFileSync(INDEX_PATH,'utf8')); } catch{ return { vectors:[] }; } }
function save(idx){ fs.mkdirSync(path.dirname(INDEX_PATH),{recursive:true}); fs.writeFileSync(INDEX_PATH, JSON.stringify(idx)); }

router.post('/ingest', async (_req,res)=>{
  const roots=['docs','README.md','src','server'];
  const files=[];
  for(const r of roots){
    const p=path.join(process.cwd(), r);
    if(!fs.existsSync(p)) continue;
    if(fs.statSync(p).isFile()) files.push(p);
    else files.push(...walk(p, fp=>/\.(md|mdx|txt|js|jsx|ts|tsx|cjs|mjs)$/.test(fp)));
  }
  const idx={ vectors:[] };
  for(const f of files){
    const text=fs.readFileSync(f,'utf8');
    for(const c of chunk(text)){
      const emb = await client.embeddings.create({ model: EMB_MODEL, input: c });
      idx.vectors.push({ vec: emb.data[0].embedding, source: path.relative(process.cwd(), f), chunk: c.slice(0,2000) });
    }
  }
  save(idx);
  res.json({ indexed: idx.vectors.length, files: files.length });
});

function cos(a,b){ let dot=0,na=0,nb=0; for(let i=0;i<a.length;i++){ dot+=a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i]; } return dot/(Math.sqrt(na)*Math.sqrt(nb)+1e-9); }

router.get('/search', async (req,res)=>{
  const q=String(req.query.q||''); const k=Math.max(1, Math.min(10, Number(req.query.k||6)));
  const idx=load(); if(!idx.vectors.length) return res.json({ hits:[] });
  const emb=await client.embeddings.create({ model: EMB_MODEL, input: q });
  const qv=emb.data[0].embedding;
  const hits=idx.vectors.map(v=>({ score: cos(qv,v.vec), source:v.source, chunk:v.chunk }))
    .sort((a,b)=>b.score-a.score).slice(0,k);
  res.json({ hits });
});

module.exports = express.Router().use('/', router);
