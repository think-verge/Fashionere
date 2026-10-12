import mongoose, { Types } from "mongoose";
import axios from "axios";
import sharp from "sharp";
import { env } from "../../config/env.js";
import { ApiError } from "../../utils/api-error.js";
import { Concept } from "../../models/Concept.js";
import { Workspace } from "../../models/Workspace.js";
import { GarmentPack } from "../../models/GarmentPack.js";
import { cropRegion } from "../garmentPack/regions.js";
import {
  ModelShoot,
  type IEditorialCopy,
  type IGarmentRead,
  type IModelConfig,
  type IModelShoot,
  type IOutfit,
  type IShootImage,
  type ShootStatus,
} from "../../models/ModelShoot.js";
import {
  COST_SEEDREAM_EDIT,
  SEEDREAM_EDIT_MODEL,
  describeError,
  readGridFSBuffer,
  storeRemoteImage,
  submitSeedreamEdit,
  waitForFalImage,
} from "../falQueue.js";
import {
  ART_DIRECTOR_SCHEMA,
  EDITORIAL_COPY_SCHEMA,
  editorialCopyPrompt,
  GARMENT_READ_SCHEMA,
  artDirectorPrompt,
  editMainPrompt,
  garmentReadPrompt,
  mainPrompt,
  shotPrompt,
  type ShotIdea,
} from "./prompts.js";

// Stage 3: the finalised garment on a model, as magazine-style studio shots.
// Flow: model config → ONE main image → the designer edits/regenerates it until happy → approve →
// an art director invents new shots (nothing predefined) rendered from the approved main image.

const BUCKET = "model_shoots";
const DEFAULT_SHOTS = 3;
const MAX_SHOTS = 6;
// A generation still "running" after this long was lost (e.g. a backend restart) and is marked failed.
const STALE_MS = 10 * 60 * 1000;
// Bump when the garment read changes; older reads are redone on the next generation.
// v2: read from the front flat and its own crops only, never generated close-ups.
const GARMENT_READ_VERSION = 2;

export const DEFAULT_MODEL_CONFIG: IModelConfig = {
  gender: "female",
  size: "M (UK 12 / US 8)",
  height: "tall",
  skin_tone: "medium-deep warm brown",
  age: "mid-20s",
  hair: "dark hair pulled back into a low sleek bun",
};

// ---- Access ----

async function assertWorkspaceOwner(workspaceId: Types.ObjectId, userId: string) {
  const ws = await Workspace.findOne({ _id: workspaceId, user_id: userId }).lean();
  if (!ws) throw new ApiError(403, "Not authorized");
  return ws;
}

async function loadOwnedShoot(shootId: string, userId: string) {
  if (!mongoose.Types.ObjectId.isValid(shootId)) throw new ApiError(400, "Invalid shoot id");
  const shoot = await ModelShoot.findById(shootId);
  if (!shoot) throw new ApiError(404, "Model shoot not found");
  await assertWorkspaceOwner(shoot.workspace_id, userId);
  await sweepStale(shoot);
  return shoot;
}

async function sweepStale(shoot: IModelShoot) {
  const now = Date.now();
  let changed = false;
  for (const img of shoot.images) {
    if ((img.status === "pending" || img.status === "generating") && now - (img.createdAt?.getTime() ?? now) > STALE_MS) {
      img.status = "failed";
      img.error = "Generation was interrupted";
      changed = true;
    }
  }
  if (changed) {
    shoot.status = statusOf(shoot.images);
    await shoot.save();
  }
}

// ---- Shape ----

function imageUrl(shootId: string, img: IShootImage) {
  return img.status === "generated" ? `/api/v1/model-shoots/${shootId}/images/${img._id}` : null;
}

function imageView(shootId: string, img: IShootImage) {
  return {
    id: String(img._id),
    kind: img.kind,
    version: img.version ?? null,
    is_current: !!img.is_current,
    batch: img.batch ?? null,
    instruction: img.instruction ?? null,
    title: img.title ?? null,
    view: img.view ?? null,
    framing: img.framing ?? null,
    pose: img.pose ?? null,
    model_config: img.model_config ?? null,
    outfit: img.outfit ?? null,
    status: img.status,
    image_url: imageUrl(shootId, img),
    error: img.error ?? null,
    created_at: img.createdAt,
  };
}

function shootView(shoot: IModelShoot) {
  const id = String(shoot._id);
  const mains = shoot.images.filter((i) => i.kind === "main").sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
  const current = mains.find((i) => i.is_current) ?? mains[0] ?? null;
  const shots = shoot.images
    .filter((i) => i.kind === "shot")
    .sort((a, b) => (b.batch ?? 0) - (a.batch ?? 0) || (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
  return {
    id,
    concept_id: String(shoot.concept_id),
    garment_type: shoot.garment_type,
    status: shoot.status,
    model_config: shoot.model_config,
    outfit: shoot.outfit,
    colours: shoot.garment_read ? { dominant: shoot.garment_read.dominant_colour, accents: shoot.garment_read.accent_colours } : null,
    approved_main_id: shoot.approved_main_id ? String(shoot.approved_main_id) : null,
    editorial: shoot.editorial ?? null,
    main: { current: current ? imageView(id, current) : null, versions: mains.map((m) => imageView(id, m)) },
    shots: shots.map((s) => imageView(id, s)),
    total_cost_usd: Number(shoot.total_cost_usd.toFixed(3)),
    created_at: shoot.createdAt,
    updated_at: shoot.updatedAt,
  };
}

function statusOf(images: ReadonlyArray<{ status: string }>): ShootStatus {
  if (images.some((i) => i.status === "pending" || i.status === "generating")) return "generating";
  if (!images.some((i) => i.status === "generated")) return "failed";
  return "ready";
}

async function refreshStatus(shootId: string) {
  const shoot = await ModelShoot.findById(shootId);
  if (shoot) await ModelShoot.updateOne({ _id: shootId }, { status: statusOf(shoot.images) });
}

function assertIdle(shoot: IModelShoot) {
  if (shoot.images.some((i) => i.status === "pending" || i.status === "generating")) {
    throw new ApiError(409, "Wait for the current generation to finish");
  }
}

// ---- Inputs ----

function cleanConfig(input: Partial<IModelConfig> | undefined, base: IModelConfig): IModelConfig {
  const out = { ...base };
  for (const k of Object.keys(DEFAULT_MODEL_CONFIG) as (keyof IModelConfig)[]) {
    const v = input?.[k];
    if (v === undefined) continue;
    if (typeof v !== "string" || !v.trim() || v.length > 120) throw new ApiError(400, `model_config.${k} must be a non-empty string under 120 characters`);
    out[k] = v.trim();
  }
  return out;
}

function cleanOutfit(input: Partial<IOutfit> | undefined, base: IOutfit | null): IOutfit | null {
  if (!input) return base;
  const out: IOutfit = { top: "none", bottoms: "none", shoes: "none", accessories: "none", ...(base ?? {}) };
  for (const k of ["top", "bottoms", "shoes", "accessories"] as const) {
    const v = input[k];
    if (v === undefined) continue;
    if (typeof v !== "string" || v.length > 200) throw new ApiError(400, `outfit.${k} must be a string under 200 characters`);
    out[k] = v.trim() || "none";
  }
  return out;
}

const dataUri = (b: Buffer) => `data:image/jpeg;base64,${b.toString("base64")}`;
const forGemini = (b: Buffer) => sharp(b).resize(1536, 1536, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();

/**
 * The garment's front flat — the source of truth — plus detail crops cut straight from it (never the generated
 * section-03 close-ups: those can invent hardware, e.g. a buckle and zipper on a tie-belt jacket, which then
 * propagated into every model shot). The generated back flat is used only for back views, which the front can't show.
 */
async function garmentRefs(shoot: IModelShoot) {
  const concept = await Concept.findById(shoot.concept_id).lean();
  if (!concept?.image?.gridfs_id) throw new Error("Concept image is missing");
  const front = await readGridFSBuffer("concepts", concept.image.gridfs_id);
  const pack = await GarmentPack.findOne({ concept_id: shoot.concept_id }).lean();
  const current = (pack?.shots ?? []).filter((s) => s.is_current);
  const back = current.find((s) => s.slot === "back_flat" && s.status === "generated" && s.image?.gridfs_id);
  const regions = current.filter((s) => (s.slot === "closeup_1" || s.slot === "closeup_2") && s.region).map((s) => s.region!);
  const closeups = await Promise.all(regions.map((r) => cropRegion(front, r)));
  return { front, back: back ? await readGridFSBuffer("garment_shots", back.image!.gridfs_id!) : null, closeups };
}

async function geminiJson<T>(images: Buffer[], text: string, schema: unknown, temperature: number): Promise<T> {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");
  const parts = [
    ...(await Promise.all(images.map(forGemini))).map((b) => ({ inline_data: { mime_type: "image/jpeg", data: b.toString("base64") } })),
    { text },
  ];
  const { data } = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_PRO_MODEL}:generateContent`,
    { contents: [{ parts }], generationConfig: { temperature, responseMimeType: "application/json", responseSchema: schema } },
    { headers: { "x-goog-api-key": env.GEMINI_API_KEY, "Content-Type": "application/json" }, timeout: 180_000 },
  );
  const out = (data?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
  return JSON.parse(out) as T;
}

/** Reads the garment once per shoot: colours, fixed design, and the stylist's suggested outfit. */
async function ensureGarmentRead(shootId: string, refs: Awaited<ReturnType<typeof garmentRefs>>) {
  const shoot = await ModelShoot.findById(shootId);
  if (!shoot) throw new Error("Shoot disappeared");
  if (shoot.garment_read?.version === GARMENT_READ_VERSION && shoot.outfit) return { read: shoot.garment_read, outfit: shoot.outfit };

  const r = await geminiJson<IGarmentRead & IOutfit>(
    [refs.front, ...refs.closeups],
    garmentReadPrompt(shoot.garment_type, shoot.model_config.gender, refs.closeups.length),
    GARMENT_READ_SCHEMA,
    0.2,
  );
  const read: IGarmentRead = { version: GARMENT_READ_VERSION, dominant_colour: r.dominant_colour, accent_colours: r.accent_colours, design: r.design };
  const outfit: IOutfit = shoot.outfit ?? { top: r.top, bottoms: r.bottoms, shoes: r.shoes, accessories: r.accessories };
  await ModelShoot.updateOne({ _id: shootId }, { garment_read: read, outfit });
  return { read, outfit };
}

// ---- Rendering ----

function setImage(shootId: string, imageId: Types.ObjectId, fields: Record<string, unknown>) {
  return ModelShoot.updateOne(
    { _id: shootId, "images._id": imageId },
    { $set: Object.fromEntries(Object.entries(fields).map(([k, v]) => [`images.$.${k}`, v])) },
  );
}

async function renderToStore(shootId: string, imageId: Types.ObjectId, refs: Buffer[], prompt: string, filename: string) {
  const job = await submitSeedreamEdit(refs.map(dataUri), prompt);
  await setImage(shootId, imageId, { "generation.model": SEEDREAM_EDIT_MODEL, "generation.prompt": prompt, "generation.fal_request_id": job.request_id });
  // Seedream takes ~2 min; allow up to 6.
  const result = await waitForFalImage(job, { intervalMs: 5000, maxAttempts: 72 });
  const stored = await storeRemoteImage(result.imageUrl, BUCKET, filename);
  const meta = await sharp(stored.buffer).metadata();
  await setImage(shootId, imageId, {
    status: "generated",
    image: { gridfs_id: stored.gridfsId, width: meta.width, height: meta.height },
    "generation.cost_usd": COST_SEEDREAM_EDIT,
  });
  await ModelShoot.updateOne({ _id: shootId }, { $inc: { total_cost_usd: COST_SEEDREAM_EDIT } });
}

async function renderMain(shootId: string, imageId: Types.ObjectId) {
  try {
    await setImage(shootId, imageId, { status: "generating", error: null });
    const shoot = await ModelShoot.findById(shootId);
    const img = shoot?.images.id(imageId);
    if (!shoot || !img) return;
    const refs = await garmentRefs(shoot);
    const { read, outfit } = await ensureGarmentRead(shootId, refs);

    let images: Buffer[];
    let prompt: string;
    if (img.instruction && img.based_on) {
      const base = shoot.images.id(img.based_on);
      if (!base?.image?.gridfs_id) throw new Error("The version being edited has no image");
      images = [await readGridFSBuffer(BUCKET, base.image.gridfs_id), refs.front];
      prompt = editMainPrompt(shoot.garment_type, img.instruction, read);
    } else {
      images = [refs.front, ...refs.closeups];
      prompt = mainPrompt(shoot.garment_type, img.model_config ?? shoot.model_config, read, img.outfit ?? outfit, refs.closeups.length);
    }
    await setImage(shootId, imageId, { outfit: img.outfit ?? outfit });
    await renderToStore(shootId, imageId, images, prompt, `main_${shootId}_v${img.version}.jpg`);
  } catch (err) {
    const error = describeError(err);
    console.error(`Model shoot ${shootId} main ${imageId} failed: ${error}`);
    await setImage(shootId, imageId, { status: "failed", error: error.split("\n")[0].slice(0, 300) });
  } finally {
    await refreshStatus(shootId);
  }
}

async function runShots(shootId: string, imageIds: Types.ObjectId[]) {
  try {
    const shoot = await ModelShoot.findById(shootId);
    if (!shoot?.approved_main_id || !shoot.garment_read) throw new Error("No approved main image");
    const main = shoot.images.id(shoot.approved_main_id);
    if (!main?.image?.gridfs_id) throw new Error("Approved main image is missing");
    const mainBuf = await readGridFSBuffer(BUCKET, main.image.gridfs_id);
    const refs = await garmentRefs(shoot);

    const { shots } = await geminiJson<{ shots: ShotIdea[] }>(
      [mainBuf, refs.front],
      artDirectorPrompt(shoot.garment_type, imageIds.length, !!refs.back),
      ART_DIRECTOR_SCHEMA,
      0.9,
    );
    if (!shots?.length) throw new Error("The art director returned no shots");

    const read = shoot.garment_read;
    await Promise.allSettled(imageIds.map(async (id, i) => {
      const idea = shots[i % shots.length];
      try {
        await setImage(shootId, id, { status: "generating", title: idea.title, view: idea.view, framing: idea.framing, pose: idea.pose, camera: idea.camera });
        const useBack = idea.view === "back" && !!refs.back;
        const images = useBack ? [mainBuf, refs.back!] : [mainBuf, refs.front, ...refs.closeups];
        const prompt = shotPrompt(shoot.garment_type, idea, read, useBack, useBack ? 0 : refs.closeups.length);
        await renderToStore(shootId, id, images, prompt, `shot_${shootId}_${id}.jpg`);
      } catch (err) {
        const error = describeError(err);
        console.error(`Model shoot ${shootId} shot ${id} failed: ${error}`);
        await setImage(shootId, id, { status: "failed", error: error.split("\n")[0].slice(0, 300) });
      }
    }));
  } catch (err) {
    const error = describeError(err);
    console.error(`Model shoot ${shootId} shots failed: ${error}`);
    for (const id of imageIds) await setImage(shootId, id, { status: "failed", error: error.split("\n")[0].slice(0, 300) });
  } finally {
    await refreshStatus(shootId);
  }
}

// ---- Main image ----

function addMainVersion(shoot: IModelShoot, fields: Partial<IShootImage>) {
  const mains = shoot.images.filter((i) => i.kind === "main");
  mains.forEach((m) => (m.is_current = false));
  const img = shoot.images.create({
    kind: "main",
    version: Math.max(0, ...mains.map((m) => m.version ?? 0)) + 1,
    is_current: true,
    status: "pending",
    model_config: shoot.model_config,
    outfit: shoot.outfit ?? undefined,
    ...fields,
  });
  shoot.images.push(img);
  shoot.status = "generating";
  return img;
}

/** Starts a shoot for a finalised garment: generates the first main image. Starting again regenerates it. */
export async function startShoot(conceptId: string, userId: string, modelConfig?: Partial<IModelConfig>) {
  if (!mongoose.Types.ObjectId.isValid(conceptId)) throw new ApiError(400, "Invalid concept id");
  const concept = await Concept.findById(conceptId).lean();
  if (!concept) throw new ApiError(404, "Concept not found");
  const workspace = await assertWorkspaceOwner(concept.workspace_id, userId);
  if (!concept.finalized) throw new ApiError(400, "Move the garment to garment concepts (Stage 2 §03) first");
  if (!concept.image?.gridfs_id) throw new ApiError(400, "Concept has no image yet");

  const existing = await ModelShoot.findOne({ concept_id: concept._id });
  if (existing) return regenerateMain(String(existing._id), userId, { model_config: modelConfig });

  const shoot = new ModelShoot({
    workspace_id: concept.workspace_id,
    user_id: workspace.user_id,
    concept_id: concept._id,
    garment_type: concept.combo.silhouette_garment_type,
    model_config: cleanConfig(modelConfig, DEFAULT_MODEL_CONFIG),
  });
  const img = addMainVersion(shoot, {});
  await shoot.save();
  void renderMain(String(shoot._id), img._id);
  return { ...shootView(shoot), estimated_cost_usd: COST_SEEDREAM_EDIT };
}

/**
 * A new version of the main image. With `instruction`, edits the current version ("make the trousers navy");
 * otherwise regenerates from scratch with the (optionally updated) model config and outfit.
 */
export async function regenerateMain(
  shootId: string,
  userId: string,
  body: { model_config?: Partial<IModelConfig>; outfit?: Partial<IOutfit>; instruction?: string },
) {
  const shoot = await loadOwnedShoot(shootId, userId);
  assertIdle(shoot);

  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  if (instruction.length > 500) throw new ApiError(400, "instruction must be under 500 characters");

  let fields: Partial<IShootImage> = {};
  if (instruction) {
    const current = shoot.images.find((i) => i.kind === "main" && i.is_current);
    if (current?.status !== "generated") throw new ApiError(400, "There is no generated main image to edit");
    fields = { instruction, based_on: current._id, model_config: current.model_config, outfit: current.outfit };
  } else {
    shoot.model_config = cleanConfig(body.model_config, shoot.model_config);
    shoot.outfit = cleanOutfit(body.outfit, shoot.outfit);
  }
  const img = addMainVersion(shoot, fields);
  await shoot.save();
  void renderMain(shootId, img._id);
  return { ...shootView(shoot), estimated_cost_usd: COST_SEEDREAM_EDIT };
}

export async function selectMainVersion(shootId: string, imageId: string, userId: string) {
  const shoot = await loadOwnedShoot(shootId, userId);
  const chosen = shoot.images.id(imageId);
  if (!chosen || chosen.kind !== "main") throw new ApiError(404, "Main image version not found");
  if (chosen.status !== "generated") throw new ApiError(400, "Only a generated version can be selected");
  for (const m of shoot.images) if (m.kind === "main") m.is_current = String(m._id) === imageId;
  // The version's look becomes the shoot's, so a later regenerate starts from what is on screen.
  if (chosen.model_config) shoot.model_config = chosen.model_config;
  if (chosen.outfit) shoot.outfit = chosen.outfit;
  await shoot.save();
  return shootView(shoot);
}

// ---- Editorial shots ----

/** Approves the current main image and generates a new batch of art-directed shots from it. */
export async function generateShots(shootId: string, userId: string, count = DEFAULT_SHOTS) {
  if (!Number.isInteger(count) || count < 1 || count > MAX_SHOTS) throw new ApiError(400, `count must be 1–${MAX_SHOTS}`);
  const shoot = await loadOwnedShoot(shootId, userId);
  assertIdle(shoot);
  const main = shoot.images.find((i) => i.kind === "main" && i.is_current);
  if (main?.status !== "generated") throw new ApiError(400, "Generate and approve a main image first");
  if (!shoot.garment_read) throw new ApiError(400, "The garment has not been read yet; regenerate the main image");

  shoot.approved_main_id = main._id;
  const batch = Math.max(0, ...shoot.images.filter((i) => i.kind === "shot").map((i) => i.batch ?? 0)) + 1;
  const ids: Types.ObjectId[] = [];
  for (let i = 0; i < count; i++) {
    const img = shoot.images.create({ kind: "shot", batch, status: "pending" });
    shoot.images.push(img);
    ids.push(img._id);
  }
  shoot.status = "generating";
  await shoot.save();
  void runShots(shootId, ids);
  return { ...shootView(shoot), estimated_cost_usd: Number((count * COST_SEEDREAM_EDIT).toFixed(3)) };
}

// ---- Editorial ----

/** Writes (or rewrites) the look's magazine copy from its approved main image. Synchronous: ~20s. */
export async function writeEditorial(shootId: string, userId: string) {
  const shoot = await loadOwnedShoot(shootId, userId);
  const hero = shoot.approved_main_id ? shoot.images.id(shoot.approved_main_id) : null;
  if (!hero?.image?.gridfs_id) throw new ApiError(400, "Approve a main image before writing the editorial");
  // Only the photograph: Stage 1 labels (fabric colour, palette) go stale once the designer refines the garment.
  const copy = await geminiJson<Omit<IEditorialCopy, "generated_at">>(
    [await readGridFSBuffer(BUCKET, hero.image.gridfs_id)],
    editorialCopyPrompt(shoot.garment_type),
    EDITORIAL_COPY_SCHEMA,
    0.8,
  );
  if (!copy.look_name || !copy.statement?.length) throw new ApiError(502, "The editorial copy could not be written; try again");
  shoot.editorial = { ...copy, statement: copy.statement.slice(0, 3), generated_at: new Date() };
  await shoot.save();
  return shootView(shoot);
}

export async function deleteShot(shootId: string, imageId: string, userId: string) {
  const shoot = await loadOwnedShoot(shootId, userId);
  const img = shoot.images.id(imageId);
  if (!img || img.kind !== "shot") throw new ApiError(404, "Shot not found");
  if (img.status === "pending" || img.status === "generating") throw new ApiError(409, "This shot is still generating");
  shoot.images.pull(img._id);
  await shoot.save();
  return shootView(shoot);
}

// ---- Reads ----

export async function getShoot(shootId: string, userId: string) {
  return shootView(await loadOwnedShoot(shootId, userId));
}

export async function getShootForConcept(conceptId: string, userId: string) {
  if (!mongoose.Types.ObjectId.isValid(conceptId)) throw new ApiError(400, "Invalid concept id");
  const concept = await Concept.findById(conceptId).lean();
  if (!concept) throw new ApiError(404, "Concept not found");
  await assertWorkspaceOwner(concept.workspace_id, userId);
  const shoot = await ModelShoot.findOne({ concept_id: concept._id });
  if (!shoot) throw new ApiError(404, "No model shoot for this concept yet");
  await sweepStale(shoot);
  return shootView(shoot);
}

/** Stage 3 in one call: every finalised garment of the workspace with its shoot (or null). */
export async function listShoots(workspaceId: string, userId: string) {
  if (!mongoose.Types.ObjectId.isValid(workspaceId)) throw new ApiError(400, "Invalid workspace id");
  await assertWorkspaceOwner(new Types.ObjectId(workspaceId), userId);
  const concepts = await Concept.find({ workspace_id: workspaceId, finalized: true }).sort({ finalized_at: 1 }).lean();
  const shoots = await ModelShoot.find({ concept_id: { $in: concepts.map((c) => c._id) } });
  await Promise.all(shoots.map(sweepStale));
  const byConcept = new Map(shoots.map((s) => [String(s.concept_id), s]));
  return {
    default_model_config: DEFAULT_MODEL_CONFIG,
    cost_per_image_usd: COST_SEEDREAM_EDIT,
    garments: concepts.map((c) => {
      const shoot = byConcept.get(String(c._id));
      return {
        concept_id: String(c._id),
        garment_type: c.combo.silhouette_garment_type,
        fabric: c.combo.fabric_label,
        accumulated_edits: c.accumulated_edits ?? [],
        front_image_url: `/api/v1/concepts/${c._id}/image`,
        shoot: shoot ? shootView(shoot) : null,
      };
    }),
  };
}

export async function getImageStream(shootId: string, imageId: string, userId: string) {
  const shoot = await loadOwnedShoot(shootId, userId);
  const img = shoot.images.id(imageId);
  if (!img?.image?.gridfs_id) throw new ApiError(404, "Image not available");
  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, { bucketName: BUCKET });
  return bucket.openDownloadStream(img.image.gridfs_id);
}
