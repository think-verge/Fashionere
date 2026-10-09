// Regenerates one slot of a concept's garment pack via the API and saves the new version.
// Usage: node scripts/regen_shot.mjs <conceptId> <slot> <outFile>
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

const [conceptId, slot, outFile] = process.argv.slice(2);
const ORIGIN = `http://localhost:${process.env.PORT || 3001}`;
const BASE = `${ORIGIN}/api/v1`;

await mongoose.connect(process.env.MONGODB_URI);
const c = await mongoose.connection.db.collection("concepts").findOne({ _id: new mongoose.Types.ObjectId(conceptId) });
const ws = await mongoose.connection.db.collection("workspaces").findOne({ _id: c.workspace_id });
await mongoose.disconnect();
const H = { Authorization: `Bearer ${jwt.sign({ userId: ws.user_id.toString(), email: "x" }, process.env.JWT_SECRET, { expiresIn: "1h" })}` };
const getSlot = async () => {
  const pack = await (await fetch(`${BASE}/concepts/${conceptId}/garment-pack`, { headers: H })).json();
  return { pack, s: pack.shots.find((x) => x.slot === slot) };
};

let { pack, s } = await getSlot();
const r = await fetch(`${BASE}/garment-packs/${pack.id}/shots/${s.current.id}/regenerate`, { method: "POST", headers: H });
console.log(`regenerate ${slot} → ${r.status}, v${(await r.json()).shot?.version}`);
for (let i = 0; i < 40; i++) {
  await new Promise((x) => setTimeout(x, 5000));
  ({ pack, s } = await getSlot());
  if (!["pending", "generating"].includes(s.current.status)) break;
}
console.log(`${slot}: ${s.versions.map((v) => `v${v.version}:${v.status}${v.is_current ? "*" : ""}`).join(" ")}${s.current.error ? ` error=${s.current.error}` : ""}`);
if (s.current.image_url) fs.writeFileSync(outFile, Buffer.from(await (await fetch(`${ORIGIN}${s.current.image_url}`, { headers: H })).arrayBuffer()));
