export async function askKnowledge(q) {
  const base = import.meta.env.VITE_API_URL || 'http://localhost:5000';
  const url = `${base}/api/knowledge?q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) return null;
  const data = await r.json().catch(() => null);
  if (!data || !data.answer) return null;
  return data; // { q, answer, sources: [{title, url}] }
}
