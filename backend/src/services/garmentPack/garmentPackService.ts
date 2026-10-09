import mongoose, { Types } from "mongoose";
import type { Response } from "express";
import sharp from "sharp";
import { ApiError } from "../../utils/api-error.js";
import { Concept } from "../../models/Concept.js";
import { Workspace } from "../../models/Workspace.js";
import { GarmentPack, type IGarmentPack, type IGarmentShot, type PackStatus, type ShotSlot } from "../../models/GarmentPack.js";
import {
  COST_FLUX2_EDIT,
  FLUX2_EDIT_MODEL,
  describeError,
  readGridFSBuffer,
  storeRemoteImage,
  submitFlux2Edit,
  waitForFalImage,
} from "../falQueue.js";
import { backFlatPrompt, closeupPrompt } from "./prompts.js";
import { analyzeGarment, cropRegion } from "./regions.js";

const BUCKET = "garment_shots";
// The front view is the refined step-2 image itself; only the views it can't show are generated.
const SLOTS: ShotSlot[] = ["back_flat", "closeup_1", "closeup_2"];

// ---- Live progress (SSE) ----

// Two audiences: a single pack's stream, and a workspace stream that receives every pack's events
// (section 03 shows all garments at once). Keys are prefixed so the two never collide.
const clients = new Map<string, Set<Response>>();
const packOwners = new Map<string, { workspaceId: string; conceptId: string }>();

function addClient(key: string, res: Response) {
  if (!clients.has(key)) clients.set(key, new Set());
  clients.get(key)!.add(res);
}

function removeClient(key: string, res: Response) {
  clients.get(key)?.delete(res);
  if (clients.get(key)?.size === 0) clients.delete(key);
}

export const addPackClient = (packId: string, res: Response) => addClient(`pack:${packId}`, res);
export const removePackClient = (packId: string, res: Response) => removeClient(`pack:${packId}`, res);
export const addWorkspaceClient = (workspaceId: string, res: Response) => addClient(`ws:${workspaceId}`, res);
export const removeWorkspaceClient = (workspaceId: string, res: Response) => removeClient(`ws:${workspaceId}`, res);

function trackPack(pack: IGarmentPack) {
  packOwners.set(String(pack._id), { workspaceId: String(pack.workspace_id), conceptId: String(pack.concept_id) });
}

function emit(packId: string, event: string, data: Record<string, unknown>) {
  const owner = packOwners.get(packId);
  const payload = `event: ${event}\ndata: ${JSON.stringify({ pack_id: packId, concept_id: owner?.conceptId, ...data })}\n\n`;
  for (const res of clients.get(`pack:${packId}`) ?? []) res.write(payload);
  if (owner) for (const res of clients.get(`ws:${owner.workspaceId}`) ?? []) res.write(payload);
}

// ---- Access helpers ----

async function assertWorkspaceOwner(workspaceId: Types.ObjectId, userId: string) {
  const ws = await Workspace.findOne({ _id: workspaceId, user_id: userId }).lean();
  if (!ws) throw new ApiError(403, "Not authorized");
  return ws;
}

async function loadOwnedConcept(conceptId: string, userId: string) {
  if (!mongoose.Types.ObjectId.isValid(conceptId)) throw new ApiError(400, "Invalid concept id");
  const concept = await Concept.findById(conceptId).lean();
  if (!concept) throw new ApiError(404, "Concept not found");
  const workspace = await assertWorkspaceOwner(concept.workspace_id, userId);
  return { concept, workspace };
}

async function loadOwnedPack(packId: string, userId: string) {
  if (!mongoose.Types.ObjectId.isValid(packId)) throw new ApiError(400, "Invalid pack id");
  const pack = await GarmentPack.findById(packId);
  if (!pack) throw new ApiError(404, "Garment pack not found");
  await assertWorkspaceOwner(pack.workspace_id, userId);
  return pack;
}

function dataUri(buf: Buffer) {
  const mime = buf[0] === 0x89 && buf[1] === 0x50 ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

// ---- Response shape ----

function shotView(packId: string, s: IGarmentShot) {
  return {
    id: String(s._id),
    slot: s.slot,
    version: s.version,
    is_current: s.is_current,
    status: s.status,
    focus: s.focus ?? null,
    feature_type: s.feature_type ?? null,
    caption: s.caption ?? null,
    region: s.region ?? null,
    image_url: s.status === "generated" ? `/api/v1/garment-packs/${packId}/shots/${s._id}/image` : null,
    error: s.error ?? null,
    created_at: s.createdAt,
  };
}

function packView(pack: IGarmentPack) {
  const packId = String(pack._id);
  return {
    id: packId,
    concept_id: String(pack.concept_id),
    status: pack.status,
    garment_type: pack.inputs.garment_type,
    regions_source: pack.inputs.regions_source ?? null,
    total_cost_usd: pack.total_cost_usd,
    front_image_url: `/api/v1/concepts/${pack.concept_id}/image`,
    shots: SLOTS.map((slot) => {
      const versions = pack.shots.filter((s) => s.slot === slot).sort((a, b) => b.version - a.version);
      const current = versions.find((s) => s.is_current) ?? versions[0];
      return {
        slot,
        current: current ? shotView(packId, current) : null,
        versions: versions.map((s) => shotView(packId, s)),
      };
    }),
    created_at: pack.createdAt,
    updated_at: pack.updatedAt,
  };
}

async function refreshPackStatus(packId: string): Promise<PackStatus> {
  const pack = await GarmentPack.findById(packId).lean();
  if (!pack) return "failed";
  const current = pack.shots.filter((s) => s.is_current);
  let status: PackStatus;
  if (current.some((s) => s.status === "pending" || s.status === "generating")) status = "generating";
  else if (current.every((s) => s.status === "generated")) status = "ready";
  else if (current.every((s) => s.status === "failed")) status = "failed";
  else status = "partial";
  await GarmentPack.updateOne({ _id: packId }, { status });
  return status;
}

// ---- Finalise ----

export async function setFinalized(conceptId: string, userId: string, finalized: boolean) {
  const { concept } = await loadOwnedConcept(conceptId, userId);
  if (finalized) {
    if (!concept.image?.gridfs_id) throw new ApiError(400, "Concept has no image yet");
    if (!["generated", "approved"].includes(concept.status)) {
      throw new ApiError(400, `Cannot finalise a concept with status "${concept.status}"`);
    }
  }
  return Concept.findByIdAndUpdate(
    conceptId,
    { finalized, finalized_at: finalized ? new Date() : null },
    { new: true },
  ).lean();
}

// ---- Generation ----

export async function startGarmentPack(conceptId: string, userId: string, force = false) {
  const { concept, workspace } = await loadOwnedConcept(conceptId, userId);
  if (!concept.finalized) throw new ApiError(400, "Finalise the concept before generating its garment pack");
  if (!concept.image?.gridfs_id) throw new ApiError(400, "Concept has no image yet");

  let pack = await GarmentPack.findOne({ concept_id: concept._id });
  if (pack && !force) {
    return { ...packView(pack), started: false, stream_url: `/garment-packs/${pack._id}/stream`, estimated_cost_usd: 0 };
  }

  let newShotIds: Types.ObjectId[];
  let needRegions: boolean;
  if (pack) {
    // Force: a new version of every slot, reusing the regions found the first time.
    newShotIds = [];
    for (const slot of SLOTS) {
      const versions = pack.shots.filter((s) => s.slot === slot);
      const prev = versions.find((s) => s.is_current) ?? versions[versions.length - 1];
      versions.forEach((s) => (s.is_current = false));
      const shot = pack.shots.create({
        slot,
        version: Math.max(0, ...versions.map((s) => s.version)) + 1,
        is_current: true,
        focus: prev?.focus ?? null,
        feature_type: prev?.feature_type ?? null,
        caption: prev?.caption ?? null,
        region: prev?.region ?? null,
        status: "pending",
      });
      pack.shots.push(shot);
      newShotIds.push(shot._id);
    }
    needRegions = !pack.shots.some((s) => s.slot === "closeup_1" && s.region);
    pack.status = "generating";
    await pack.save();
  } else {
    pack = await GarmentPack.create({
      workspace_id: concept.workspace_id,
      user_id: workspace.user_id,
      concept_id: concept._id,
      root_concept_id: concept.root_concept ?? concept._id,
      status: "generating",
      inputs: {
        front_gridfs_id: concept.image.gridfs_id,
        garment_type: concept.combo.silhouette_garment_type,
      },
      shots: SLOTS.map((slot) => ({ slot, version: 1, is_current: true, status: "pending" })),
    });
    newShotIds = pack.shots.map((s) => s._id);
    needRegions = true;
  }

  const packId = String(pack._id);
  trackPack(pack);
  runPack(packId, newShotIds, needRegions).catch((err) => console.error(`Garment pack ${packId} failed: ${describeError(err)}`));

  return {
    ...packView(pack),
    started: true,
    stream_url: `/garment-packs/${packId}/stream`,
    estimated_cost_usd: Number((newShotIds.length * COST_FLUX2_EDIT).toFixed(2)),
  };
}

function loadFrontFlat(pack: IGarmentPack) {
  return readGridFSBuffer("concepts", pack.inputs.front_gridfs_id);
}

async function runPack(packId: string, shotIds: Types.ObjectId[], needRegions: boolean) {
  const pack = await GarmentPack.findById(packId);
  if (!pack) return;
  const front = await loadFrontFlat(pack);

  if (needRegions) {
    const analysis = await analyzeGarment(front, pack.inputs.garment_type);
    const assign: Partial<Record<ShotSlot, (typeof analysis.closeups)[number]>> = {
      closeup_1: analysis.closeups[0],
      closeup_2: analysis.closeups[1],
    };
    for (const shot of pack.shots) {
      const a = assign[shot.slot];
      if (a && shotIds.some((id) => id.equals(shot._id))) {
        shot.focus = a.label;
        shot.feature_type = a.feature_type;
        shot.caption = a.caption;
        shot.region = a.box;
      }
    }
    pack.inputs.regions_source = analysis.source;
    pack.inputs.cuff_region = analysis.cuff;
    await pack.save();
    emit(packId, "regions_ready", { source: analysis.source, closeups: analysis.closeups, cuff: analysis.cuff });
  }

  await Promise.allSettled(shotIds.map((id) => renderShot(packId, id, front)));
  const status = await refreshPackStatus(packId);
  const done = await GarmentPack.findById(packId);
  emit(packId, "pack_done", { status, total_cost_usd: done?.total_cost_usd ?? 0 });
}

async function renderShot(packId: string, shotId: Types.ObjectId, front: Buffer) {
  const set = (fields: Record<string, unknown>) =>
    GarmentPack.updateOne(
      { _id: packId, "shots._id": shotId },
      { $set: Object.fromEntries(Object.entries(fields).map(([k, v]) => [`shots.$.${k}`, v])) },
    );

  const pack = await GarmentPack.findById(packId).lean();
  const shot = pack?.shots.find((s) => s._id.equals(shotId));
  if (!pack || !shot) return;
  const type = pack.inputs.garment_type;

  try {
    await set({ status: "generating", error: null });
    let images: Buffer[];
    let prompt: string;
    if (shot.slot === "back_flat") {
      const cuff = pack.inputs.cuff_region ? await cropRegion(front, pack.inputs.cuff_region) : null;
      images = cuff ? [front, cuff] : [front];
      prompt = backFlatPrompt(type, !!cuff);
    } else {
      if (!shot.region) throw new Error(`No region assigned for ${shot.slot}`);
      images = [await cropRegion(front, shot.region)];
      prompt = closeupPrompt();
    }

    const job = await submitFlux2Edit(images.map(dataUri), prompt);
    await set({ "generation.model": FLUX2_EDIT_MODEL, "generation.prompt": prompt, "generation.fal_request_id": job.request_id });

    const result = await waitForFalImage(job);
    const stored = await storeRemoteImage(result.imageUrl, BUCKET, `${shot.slot}_${packId}_v${shot.version}.jpg`);
    const meta = await sharp(stored.buffer).metadata();

    await set({
      status: "generated",
      image: { gridfs_id: stored.gridfsId, width: meta.width, height: meta.height },
      "generation.inference_time_s": result.inferenceTime,
      "generation.cost_usd": COST_FLUX2_EDIT,
    });
    await GarmentPack.updateOne({ _id: packId }, { $inc: { total_cost_usd: COST_FLUX2_EDIT } });
    emit(packId, "shot_ready", {
      shot_id: String(shotId),
      slot: shot.slot,
      version: shot.version,
      image_url: `/api/v1/garment-packs/${packId}/shots/${shotId}/image`,
    });
  } catch (err) {
    const error = describeError(err);
    console.error(`Garment shot ${shot.slot} v${shot.version} (pack ${packId}) failed: ${error}`);
    await set({ status: "failed", error });
    emit(packId, "shot_failed", { shot_id: String(shotId), slot: shot.slot, version: shot.version, error });
  }
}

// ---- Versions ----

export async function regenerateShot(packId: string, shotId: string, userId: string) {
  const pack = await loadOwnedPack(packId, userId);
  const base = pack.shots.id(shotId);
  if (!base) throw new ApiError(404, "Shot not found");

  const versions = pack.shots.filter((s) => s.slot === base.slot);
  versions.forEach((s) => (s.is_current = false));
  const shot = pack.shots.create({
    slot: base.slot,
    version: Math.max(...versions.map((s) => s.version)) + 1,
    is_current: true,
    focus: base.focus,
    feature_type: base.feature_type,
    caption: base.caption,
    region: base.region,
    status: "pending",
  });
  pack.shots.push(shot);
  pack.status = "generating";
  await pack.save();
  trackPack(pack);

  (async () => {
    await renderShot(packId, shot._id, await loadFrontFlat(pack));
    const status = await refreshPackStatus(packId);
    const done = await GarmentPack.findById(packId);
    emit(packId, "pack_done", { status, total_cost_usd: done?.total_cost_usd ?? 0 });
  })().catch((err) => console.error(`Regenerate ${shotId} failed: ${describeError(err)}`));

  return {
    shot: shotView(packId, shot),
    stream_url: `/garment-packs/${packId}/stream`,
    estimated_cost_usd: COST_FLUX2_EDIT,
  };
}

export async function selectShotVersion(packId: string, shotId: string, userId: string) {
  const pack = await loadOwnedPack(packId, userId);
  const chosen = pack.shots.id(shotId);
  if (!chosen) throw new ApiError(404, "Shot not found");
  if (chosen.status !== "generated") throw new ApiError(400, "Only a generated version can be selected");
  for (const s of pack.shots) if (s.slot === chosen.slot) s.is_current = String(s._id) === String(chosen._id);
  await pack.save();
  await refreshPackStatus(packId);
  return packView((await GarmentPack.findById(packId))!);
}

// ---- Reads ----

export async function getGarmentPack(conceptId: string, userId: string) {
  const { concept } = await loadOwnedConcept(conceptId, userId);
  const pack = await GarmentPack.findOne({ concept_id: concept._id });
  if (!pack) throw new ApiError(404, "No garment pack for this concept yet");
  return packView(pack);
}

export async function getPackForStream(packId: string, userId: string) {
  return loadOwnedPack(packId, userId);
}

export async function getShotImage(packId: string, shotId: string, userId: string) {
  const pack = await loadOwnedPack(packId, userId);
  const shot = pack.shots.id(shotId);
  if (!shot?.image?.gridfs_id) throw new ApiError(404, "Shot image not available");
  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, { bucketName: BUCKET });
  return bucket.openDownloadStream(shot.image.gridfs_id);
}

// ---- Section 03 (workspace-level) ----

const MAX_MOVE = 20;

/** Everything section 03 needs in one call: finalised concepts with their pack (or null if none yet). */
export async function listGarmentConcepts(workspaceId: string, userId: string) {
  if (!mongoose.Types.ObjectId.isValid(workspaceId)) throw new ApiError(400, "Invalid workspace id");
  await assertWorkspaceOwner(new Types.ObjectId(workspaceId), userId);

  const concepts = await Concept.find({ workspace_id: workspaceId, finalized: true }).sort({ finalized_at: 1 }).lean();
  const packs = await GarmentPack.find({ concept_id: { $in: concepts.map((c) => c._id) } });
  const byConcept = new Map(packs.map((p) => [String(p.concept_id), p]));

  return {
    workspace_stream_url: `/garment-packs/workspace/${workspaceId}/stream`,
    garments: concepts.map((c) => {
      const pack = byConcept.get(String(c._id));
      return {
        concept_id: String(c._id),
        root_concept_id: String(c.root_concept ?? c._id),
        garment_type: c.combo.silhouette_garment_type,
        accumulated_edits: c.accumulated_edits ?? [],
        finalized_at: c.finalized_at,
        front_image_url: `/api/v1/concepts/${c._id}/image`,
        pack: pack ? packView(pack) : null,
      };
    }),
  };
}

/** Moves refined variants into section 03: finalises each and starts its garment pack. */
export async function moveToGarmentConcepts(workspaceId: string, conceptIds: string[], userId: string) {
  if (!mongoose.Types.ObjectId.isValid(workspaceId)) throw new ApiError(400, "Invalid workspace id");
  if (!Array.isArray(conceptIds) || conceptIds.length === 0) throw new ApiError(400, "concept_ids must be a non-empty array");
  if (conceptIds.length > MAX_MOVE) throw new ApiError(400, `Move at most ${MAX_MOVE} garments at a time`);
  await assertWorkspaceOwner(new Types.ObjectId(workspaceId), userId);

  const results = [];
  let estimated = 0;
  for (const id of [...new Set(conceptIds)]) {
    try {
      if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, "Invalid concept id");
      const concept = await Concept.findById(id).lean();
      if (!concept || String(concept.workspace_id) !== workspaceId) throw new ApiError(404, "Concept not found in this workspace");
      await setFinalized(id, userId, true);
      const started = await startGarmentPack(id, userId);
      estimated += started.estimated_cost_usd;
      results.push({ concept_id: id, ok: true, started: started.started, pack_id: started.id });
    } catch (err) {
      results.push({ concept_id: id, ok: false, error: err instanceof ApiError ? err.message : describeError(err) });
    }
  }

  return {
    workspace_stream_url: `/garment-packs/workspace/${workspaceId}/stream`,
    estimated_cost_usd: Number(estimated.toFixed(2)),
    results,
  };
}

export async function assertWorkspaceStreamAccess(workspaceId: string, userId: string) {
  if (!mongoose.Types.ObjectId.isValid(workspaceId)) throw new ApiError(400, "Invalid workspace id");
  await assertWorkspaceOwner(new Types.ObjectId(workspaceId), userId);
}
