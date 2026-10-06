// End-to-end smoke test of the garment pack API.
// Usage: node scripts/smoke_garment_pack.mjs <conceptId> <outDir> [--force]
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

const [conceptId, outDir, flag] = process.argv.slice(2);
const BASE = `http://localhost:${process.env.PORT || 3001}/api/v1`;

await mongoose.connect(process.env.MONGODB_URI);
const concept = await mongoose.connection.db.collection("concepts").findOne({ _id: new mongoose.Types.ObjectId(conceptId) });
const ws = await mongoose.connection.db.collection("workspaces").findOne({ _id: concept.workspace_id });
await mongoose.disconnect();
const token = jwt.sign({ userId: ws.user_id.toString(), email: "smoke@test" }, process.env.JWT_SECRET, { expiresIn: "1h" });
const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const call = async (method, path) => {
  const r = await fetch(`${BASE}${path}`, { method, headers: H });
  const body = await r.json().catch(() => ({}));
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) throw new Error(JSON.stringify(body));
  return body;
};

await call("POST", `/concepts/${conceptId}/finalize`);
const start = await call("POST", `/concepts/${conceptId}/garment-pack${flag === "--force" ? "?force=true" : ""}`);
console.log(`pack ${start.id} started=${start.started} est=$${start.estimated_cost_usd}`);

const t0 = Date.now();
let pack;
while (Date.now() - t0 < 6 * 60_000) {
  await new Promise((r) => setTimeout(r, 5000));
  pack = await (await fetch(`${BASE}/concepts/${conceptId}/garment-pack`, { headers: H })).json();
  const line = pack.shots.map((s) => `${s.slot}:${s.current?.status}`).join(" ");
  process.stdout.write(`\r${((Date.now() - t0) / 1000).toFixed(0)}s ${pack.status} | ${line}      `);
  if (pack.status !== "generating") break;
}
console.log(`\nfinal: ${pack.status}, regions=${pack.regions_source}, cost=$${pack.total_cost_usd}`);

for (const s of pack.shots) {
  const c = s.current;
  console.log(`  ${s.slot} v${c.version} ${c.status} focus=${c.focus ?? "-"} region=${JSON.stringify(c.region)}${c.error ? ` error=${c.error}` : ""}`);
  if (c.image_url) {
    const img = await fetch(`http://localhost:${process.env.PORT || 3001}${c.image_url}`, { headers: H });
    fs.writeFileSync(`${outDir}/${s.slot}_v${c.version}.jpg`, Buffer.from(await img.arrayBuffer()));
  }
}
