/* scripts/check-coach-strict.mjs */
const res = await fetch("http://localhost:5000/api/coach/strict", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ files: ["docs/roadmap.json.md"] })
});
if (!res.ok) {
  console.error("HTTP", res.status, res.statusText);
  process.exit(1);
}
const data = await res.json();
if (!data || !Array.isArray(data.key_points) || data.key_points.length !== 5) {
  console.error("Unexpected response:", JSON.stringify(data, null, 2));
  process.exit(2);
}
console.log("OK: strict endpoint returned", data.key_points.length, "key_points.");
