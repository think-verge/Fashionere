import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();
const UI = "http://localhost:5173";
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const user = await db.collection("users").findOne({});
const H = { Authorization: `Bearer ${jwt.sign({ userId: user._id.toString(), email: user.email }, process.env.JWT_SECRET, { expiresIn: "1h" })}` };
const decons = await db.collection("deconstructions").find({}).toArray();
const issues = {}; const add = (k, m) => (issues[k] ??= []).push(m);
const seen = new Map();
async function img(url) {
  if (!url) return "null";
  if (seen.has(url)) return seen.get(url);
  const r = await fetch(url.startsWith("http") ? url : UI + url);
  const ok = r.ok && (r.headers.get("content-type") || "").startsWith("image/") ? "ok" : `HTTP ${r.status} ${r.headers.get("content-type")}`;
  seen.set(url, ok); return ok;
}
let looks = 0, garments = 0, images = 0;
for (const d of decons) {
  const id = d.look_id ?? d._id;
  const lr = await fetch(`${UI}/api/v1/looks/${encodeURIComponent(id)}`, { headers: H });
  if (!lr.ok) { add("look endpoint failed", `${id} → ${lr.status}`); continue; }
  const look = await lr.json(); looks++;
  const gr = await (await fetch(`${UI}/api/v1/looks/${encodeURIComponent(id)}/garments`, { headers: H })).json();
  const gs = gr.garments ?? gr;
  if (!look.is_deconstructed) add("look marked not deconstructed", id);
  if ((d.garments ?? []).length !== gs.length) add("garment count mismatch (db vs api)", `${id}: ${d.garments?.length} vs ${gs.length}`);
  for (const [i, g] of gs.entries()) {
    garments++;
    const raw = d.garments?.[i] ?? {};
    const tag = `${id} #${i} ${g.garment_type ?? g.piece}`;
    if (!g.colors?.length) add("no colors", tag);
    else if (g.colors.some(c => !c.hex)) add("color missing hex", tag);
    if (raw.flat?.gridfs_id && !g.flat_url) add("flat in db but not in api", tag);
    if (!g.flat_url) add("no flat sketch", tag);
    for (const [kind, arr] of [["fabric", g.fabrics ?? []], ["pattern", g.patterns ?? []]]) {
      const rawArr = raw[kind + "s"] ?? [];
      rawArr.forEach((rf, j) => { if (rf.gridfs_id && !arr[j]?.image_url) add(`${kind} image in db but not in api`, tag); });
    }
    for (const [label, url] of [["flat", g.flat_url], ...(g.fabrics ?? []).map(f => ["fabric", f.image_url]), ...(g.patterns ?? []).map(p => ["pattern", p.image_url])]) {
      if (!url) continue; images++;
      const s = await img(url); if (s !== "ok") add(`${label} image failed to load`, `${tag}: ${s} ${url}`);
    }
  }
}
console.log(`looks: ${looks}/${decons.length}, garments: ${garments}, image urls checked: ${images} (${seen.size} unique)`);
const brands = {}; for (const d of decons) brands[d.brand] = (brands[d.brand] ?? 0) + 1;
console.log("brands:", JSON.stringify(brands));
if (!Object.keys(issues).length) console.log("NO ISSUES");
for (const [k, v] of Object.entries(issues)) { console.log(`\n[${k}] x${v.length}`); v.slice(0, 6).forEach(x => console.log("   " + x)); }
await mongoose.disconnect();
