import fs from "fs";

const fmt = (d) =>
  new Date(d).toISOString().replace("T", " ").slice(0, 16) + " UTC";

async function vercel() {
  const r = await fetch(
    `https://api.vercel.com/v13/deployments?projectId=${process.env.VERCEL_PROJECT_ID}&limit=1`,
    { headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` } }
  );
  const j = await r.json();
  const d = j.deployments?.[0] || {};
  return {
    status: d.readyState || "UNKNOWN",
    when: d.createdAt ? fmt(d.createdAt) : "—",
    url: d.url ? `https://${d.url}` : "",
  };
}

async function render() {
  const srv = process.env.RENDER_SERVICE_ID;
  const headers = { Authorization: `Bearer ${process.env.RENDER_API_KEY}` };
  const r1 = await fetch(`https://api.render.com/v1/services/${srv}`, { headers });
  const s = await r1.json();
  const r2 = await fetch(`https://api.render.com/v1/services/${srv}/deploys?limit=1`, { headers });
  const d = (await r2.json())?.[0] || {};
  return {
    status: s?.service?.status || s?.status || "UNKNOWN",
    when: d?.createdAt ? fmt(d.createdAt) : "—",
    sha: d?.commit?.id ? d.commit.id.slice(0, 7) : (s?.deploy?.commitId ? s.deploy.commitId.slice(0, 7) : "—"),
    dash: `https://dashboard.render.com/web/${srv}`,
  };
}

async function github() {
  // These envs are provided by Actions
  const repo = process.env.GITHUB_REPOSITORY;
  const shaLong = process.env.GITHUB_SHA;
  const sha = shaLong?.slice(0, 7) || "—";
  // Fallbacks if git not available:
  let msg = "latest commit";
  let when = fmt(Date.now());
  try {
    const { execSync } = await import("node:child_process");
    msg = execSync("git log -1 --pretty=%s").toString().trim() || msg;
    when = fmt(execSync("git log -1 --pretty=%cI").toString().trim());
  } catch {}
  const link = `https://github.com/${repo}/commit/${shaLong}`;
  return { sha, msg, when, link };
}

try {
  const v = await vercel().catch(() => ({ status: "ERROR", when: "—", url: "" }));
  const r = await render().catch(() => ({ status: "ERROR", when: "—", sha: "—", dash: "" }));
  const g = await github();

  const block = `**Repo:** ${process.env.GITHUB_REPOSITORY}
**Branch:** ${process.env.GITHUB_REF_NAME || "main"}

| Service | Status | When | Link |
|---|---|---|---|
| GitHub | Commit \`${g.sha}\` — ${g.msg} | ${g.when} | [View](${g.link}) |
| Vercel | ${v.status} | ${v.when} | ${v.url ? `[Open](${v.url})` : "—"} |
| Render (api) | ${r.status}<br/><sub>Commit \`${r.sha}\`</sub> | ${r.when} | ${r.dash ? `[Dashboard](${r.dash})` : "—"} |

_Last updated: ${fmt(Date.now())}_
`;

  const readme = fs.readFileSync("README.md", "utf8");
  const out = readme.replace(
    /<!-- STATUS-START -->[\s\S]*<!-- STATUS-END -->/,
    `<!-- STATUS-START -->\n${block}\n<!-- STATUS-END -->`
  );
  fs.writeFileSync("README.md", out);
  console.log("README status updated.");
} catch (e) {
  console.error(e);
  process.exit(1);
}
