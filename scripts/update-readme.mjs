import fs from "fs";

const fmt = (d) =>
  new Date(d).toISOString().replace("T", " ").slice(0, 16) + " UTC";

async function vercel() {
  const u = new URL("https://api.vercel.com/v6/deployments");

  if (process.env.VERCEL_PROJECT_NAME) u.searchParams.set("app", process.env.VERCEL_PROJECT_NAME);
  else u.searchParams.set("projectId", process.env.VERCEL_PROJECT_ID);
  u.searchParams.set("limit", "1");

  const r = await fetch(u, { headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` } });
  if (!r.ok) {
  const txt = await r.text();
  console.log("VERCEL_ERROR:", r.status, txt);
  throw new Error(`Vercel API ${r.status}`);
}

  const j = await r.json();
  const d = j.deployments?.[0] || {};
  return {
    status: (d.readyState || "UNKNOWN").toUpperCase(),
    when: d.createdAt ? fmt(d.createdAt) : "—",
    url: d.url ? `https://${d.url}` : "",
  };
}



async function render() {
  const id = process.env.RENDER_SERVICE_ID;
  const headers = { Authorization: `Bearer ${process.env.RENDER_API_KEY}` };

  // latest deploy
  const r = await fetch(`https://api.render.com/v1/services/${id}/deploys?limit=1`, { headers });
  if (!r.ok) return { status: `ERR ${r.status}`, when: "—", sha: "—", dash: `https://dashboard.render.com/services/${id}` };

  const arr = await r.json();
  const d = Array.isArray(arr) && arr[0] ? arr[0] : null;

  return {
    status: (d?.status || "UNKNOWN").toUpperCase(),
    when: d?.finishedAt || d?.createdAt ? fmt(d.finishedAt || d.createdAt) : "—",
    sha: d?.commitId
      ? d.commitId.slice(0,7)
      : (d?.commit?.id ? d.commit.id.slice(0,7) : "—"),
    dash: `https://dashboard.render.com/services/${id}`,
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
