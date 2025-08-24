const { Octokit } = require('@octokit/rest');

function parseRepo(){
  const full = process.env.GITHUB_REPO || '';
  if(!full.includes('/')) throw new Error('GITHUB_REPO must be owner/repo');
  const [owner, repo] = full.split('/');
  return { owner, repo };
}
function octo(){ return new Octokit({ auth: process.env.GITHUB_TOKEN }); }
async function getBaseSha(o, owner, repo, base){ const { data } = await o.git.getRef({ owner, repo, ref:heads/ }); return data.object.sha; }
async function createBranch(o, owner, repo, base, branch){ const sha = await getBaseSha(o, owner, repo, base); await o.git.createRef({ owner, repo, ref:efs/heads/, sha }); }
async function getFileSha(o, owner, repo, path, ref){ try{ const { data } = await o.repos.getContent({ owner, repo, path, ref }); if(!Array.isArray(data) && data.sha) return data.sha; }catch{} return undefined; }
async function upsert(o, owner, repo, branch, path, content){ const sha = await getFileSha(o, owner, repo, path, branch); await o.repos.createOrUpdateFileContents({ owner, repo, path, message:RamRoot Builder: update .\server\routes\leads.cjs, content: Buffer.from(content).toString('base64'), branch, sha }); }
async function openPR(o, owner, repo, base, head, title, body){ const { data } = await o.pulls.create({ owner, repo, base, head, title, body }); return data; }
async function mergePR(o, owner, repo, number){ await o.pulls.merge({ owner, repo, pull_number:number, merge_method:'squash' }); }

module.exports = { parseRepo, octo, createBranch, upsert, openPR, mergePR };
