/**
 * Migrate existing workspaces to the folder/moodboard model.
 *
 *   MONGODB_URI=... node scripts/migrate-workspace-folders.mjs            # dry run (default)
 *   MONGODB_URI=... node scripts/migrate-workspace-folders.mjs --apply    # write changes
 *
 * Per workspace (skipped when schema_version >= 2 or status is "generating"):
 *   - Looks/ root and a "<name>-<created date>" folder with the 5 element folders
 *   - catalogue elements are filed by type; custom uploads go to a "Custom" folder
 *   - every existing element keeps its element_id/canvas_row/canvas_position and gets
 *     in_builder=true, so the builder and past concepts behave exactly as before
 *   - one shot element per look image plus a looks[] entry (in_builder=false)
 * Take a mongodump of `workspaces` first. Safe to re-run.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";

dotenv.config();
const APPLY = process.argv.includes("--apply");
const uri = process.env.FASHIONAIRRE_MONGO_URI ?? process.env.MONGODB_URI;
if (!uri) { console.error("Set MONGODB_URI (never hardcode it in this repo)."); process.exit(1); }

const CHILDREN = [
  ["shots", "shots"], ["silhouettes", "silhouettes"], ["palettes", "color palettes"],
  ["fabrics", "fabrics"], ["patterns", "patterns"],
];
const KIND_BY_TYPE = { silhouette: "silhouettes", color: "palettes", fabric: "fabrics", pattern: "patterns", shot: "shots" };

await mongoose.connect(uri);
const db = mongoose.connection.db;
const workspaces = db.collection("workspaces");
const folders = db.collection("folders");
const looksCol = db.collection("canonical_looks");

const day = (d) => new Date(d).toISOString().slice(0, 10);
const isCustom = (e) => e.is_custom === true || e.source_brand === "custom" || !e.look_id;

async function makeFolder(ws, parent_id, name, kind, system, extra = {}) {
  const now = new Date();
  const doc = { _id: new mongoose.Types.ObjectId(), workspace_id: ws._id, user_id: ws.user_id, parent_id, name, kind, system, createdAt: now, updatedAt: now, ...extra };
  if (APPLY) await folders.insertOne(doc);
  return doc;
}
async function makeGroup(ws, parent_id, name, kind, extra) {
  const parent = await makeFolder(ws, parent_id, name, kind, false, extra);
  const kids = {};
  for (const [k, label] of CHILDREN) kids[k] = await makeFolder(ws, parent._id, label, k, true);
  return { parent, kids };
}

let migrated = 0, skipped = 0, failed = 0;
for (const ws of await workspaces.find({}).toArray()) {
  if ((ws.schema_version ?? 1) >= 2 || ws.status === "generating") { skipped++; continue; }
  try {
    const before = ws.elements ?? [];
    const root = await makeFolder(ws, null, "Looks", "looks_root", true);
    const dateStr = day(ws.createdAt ?? Date.now());
    const main = await makeGroup(ws, root._id, `${ws.name.trim()}-${dateStr}`, "date", { date: dateStr });
    const custom = before.some(isCustom) ? await makeGroup(ws, root._id, "Custom", "custom") : null;

    const now = new Date();
    const elements = before.map((e) => {
      const group = isCustom(e) ? custom : main;
      return { ...e, is_custom: isCustom(e) ? true : (e.is_custom ?? false),
        folder_id: String(group.kids[KIND_BY_TYPE[e.element_type] ?? "silhouettes"]._id),
        in_builder: true, added_at: e.added_at ?? ws.createdAt ?? now };
    });

    const lookIds = [...new Set(before.filter((e) => e.look_id).map((e) => e.look_id))];
    const looks = [];
    for (const id of lookIds) {
      const doc = await looksCol.findOne({ _id: id }).catch(() => null);
      if (!doc) continue;
      const imgs = (doc.images ?? []).map((i) => i.url ?? i.src).filter(Boolean);
      const brand = doc.context?.brand ?? doc.brand ?? "";
      const title = doc.native_text?.product_name ?? doc.name ?? "";
      looks.push({ look_id: id, date_folder_id: String(main.parent._id), added_at: ws.createdAt ?? now, thumbnail: imgs[0] ?? null, brand, title });
      imgs.forEach((url, i) => elements.push({
        element_id: randomUUID(), look_id: id, garment_id: `shot:${i}`, garment_type: "look", element_type: "shot",
        data: { image_url: url, title }, source_brand: brand, canvas_position: { x: 0, y: 0 }, row: "look", canvas_row: null,
        is_custom: false, folder_id: String(main.kids.shots._id), in_builder: false, added_at: ws.createdAt ?? now,
      }));
    }

    // invariants: no original element lost or re-id'd, canvas state untouched
    const after = new Map(elements.map((e) => [e.element_id, e]));
    for (const e of before) {
      const a = after.get(e.element_id);
      if (!a || a.canvas_row !== e.canvas_row || a.element_type !== e.element_type) throw new Error(`element ${e.element_id} changed`);
    }

    console.log(`${APPLY ? "migrating" : "[dry-run]"} ${ws.name} (${ws._id}): ${before.length} elements, ${looks.length} looks, custom=${!!custom}`);
    if (APPLY) await workspaces.updateOne({ _id: ws._id, status: { $ne: "generating" } }, { $set: { elements, looks, schema_version: 2 } });
    migrated++;
  } catch (err) {
    failed++;
    console.error(`FAILED ${ws.name} (${ws._id}): ${err.message}`);
    if (APPLY) await folders.deleteMany({ workspace_id: ws._id });
  }
}
console.log(`done: ${migrated} ${APPLY ? "migrated" : "would migrate"}, ${skipped} skipped, ${failed} failed`);
await mongoose.disconnect();
