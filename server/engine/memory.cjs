const fs = require('fs');
const path = require('path');

function readJsonSafe(p){ try{ return JSON.parse(fs.readFileSync(p,'utf8')); } catch{ return null; } }
function locateMemory(){
  const cands=[path.join(process.cwd(),'server','public','memory.json'), path.join(process.cwd(),'public','memory.json')];
  for (const p of cands) if (fs.existsSync(p)) return p; return null;
}
function getMemory(){
  const p = locateMemory();
  return (p ? readJsonSafe(p) : null) || { principles:[], preferences:{}, features:[], constraints:[] };
}
function memoryContext(){
  const m=getMemory();
  const prefs=Object.entries(m.preferences||{}).map(([k,v])=>${k}: ).join('; ');
  return [
    '# RamRoot Memory',
    Principles: ,
    Key Prefs: ,
    Non-negotiables: 
  ].join('\n');
}
module.exports = { getMemory, memoryContext };
