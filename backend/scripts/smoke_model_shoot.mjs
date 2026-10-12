// End-to-end smoke test of the Stage 3 model-shoot API.
// Usage: node scripts/smoke_model_shoot.mjs <conceptId> <outDir> ["edit instruction"] [shotCount=2]
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

const [conceptId, outDir, instruction, shotCount = "2"] = process.argv.slice(2);
const BASE = `http://localhost:${process.env.PORT || 3001}/api/v1`;

await mongoose.connect(process.env.MONGODB_URI);
const concept = await mongoose.connection.db.collection("concepts").findOne({ _id: new mongoose.Types.ObjectId(conceptId) });
const ws = await mongoose.connection.db.collection("workspaces").findOne({ _id: concept.workspace_id });
await mongoose.disconnect();
const token = jwt.sign({ userId: ws.user_id.toString(), email: "smoke@test" }, process.env.JWT_SECRET, { expiresIn: "1h" });
const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const call = async (method, path, body, expectFail = false) => {
  const r = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const json = await r.json().catch(() => ({}));
  console.log(`${method} ${path} → ${r.status}${r.ok ? "" : ` ${JSON.stringify(json)}`}`);
  if (!r.ok && !expectFail) throw new Error("request failed");
  return json;
};
const wait = async (shootId, label) => {
  const t0 = Date.now();
  let s;
  while (Date.now() - t0 < 8 * 60_000) {
    await new Promise((r) => setTimeout(r, 5000));
    s = await call("GET", `/model-shoots/${shootId}`);
    if (s.status !== "generating") break;
  }
  console.log(`${label}: ${s.status} after ${((Date.now() - t0) / 1000).toFixed(0)}s, cost so far $${s.total_cost_usd}`);
  return s;
};
const save = async (img, name) => {
  if (!img?.image_url) return console.log(`${name}: ${img?.status} ${img?.error ?? ""}`);
  const r = await fetch(`http://localhost:${process.env.PORT || 3001}${img.image_url}`, { headers: H });
  fs.writeFileSync(`${outDir}/${name}.jpg`, Buffer.from(await r.arrayBuffer()));
  console.log(`${name}: saved (${r.status})`);
};

fs.mkdirSync(outDir, { recursive: true });
let shoot = await call("POST", `/concepts/${conceptId}/model-shoot`, { model_config: {} });
await call("POST", `/model-shoots/${shoot.id}/main`, {}, true); // expect 409 while generating
shoot = await wait(shoot.id, "main v1");
console.log("outfit:", JSON.stringify(shoot.outfit), "| colours:", JSON.stringify(shoot.colours));
await save(shoot.main.current, `main_v${shoot.main.current.version}`);

if (instruction) {
  await call("POST", `/model-shoots/${shoot.id}/main`, { instruction });
  shoot = await wait(shoot.id, "main edit");
  await save(shoot.main.current, `main_v${shoot.main.current.version}_edit`);
}

shoot = await call("POST", `/model-shoots/${shoot.id}/shots`, { count: Number(shotCount) });
shoot = await wait(shoot.id, "shots");
for (const s of shoot.shots) {
  console.log(`  batch ${s.batch} "${s.title}" (${s.view}) ${s.status}`);
  await save(s, `shot_b${s.batch}_${s.id.slice(-4)}_${s.view}`);
}
console.log(`total $${shoot.total_cost_usd}`);
