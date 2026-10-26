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
  type IEditorialFigure,
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
  EDITORIAL_EDITOR_SCHEMA,
  EDITORIAL_WRITER_SCHEMA,
  GARMENT_READ_SCHEMA,
  constructionText,
  editorialEditorPrompt,
  editorialWriterPrompt,
  outfitLine,
  type EditorialText,
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
    editorial: editorialView(id, shoot),
    main: { current: current ? imageView(id, current) : null, versions: mains.map((m) => imageView(id, m)) },
    shots: shots.map((s) => imageView(id, s)),
    total_cost_usd: Number(shoot.total_cost_usd.toFixed(3)),
    created_at: shoot.createdAt,
    updated_at: shoot.updatedAt,
  };
}

const EDITORIAL_VERSION = 2;

/** The feature with image URLs resolved; copies from an older version count as not written. */
function editorialView(shootId: string, shoot: IModelShoot) {
  const e = shoot.editorial;
  if (!e || e.version !== EDITORIAL_VERSION) return null;
  const figure = (f: IEditorialFigure) => {
    const img = shoot.images.id(f.image_id);
    return img?.status === "generated" ? { caption: f.caption, image_url: imageUrl(shootId, img) } : null;
  };
  return {
    look_name: e.look_name,
    headline: e.headline,
    standfirst: e.standfirst,
    hero_caption: e.hero_caption,
    opening: e.opening,
    pull_quote: e.pull_quote,
    details: e.details.map(figure).filter(Boolean),
    closing: e.closing,
    shots: e.shots.map(figure).filter(Boolean),
    credit_line: e.credit_line,
    fabric: e.fabric,
    palette: e.palette,
    generated_at: e.generated_at,
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

async function geminiJson<T>(images: Buffer[], text: string, schema: unknown, temperature: number, model = env.GEMINI_PRO_MODEL): Promise<T> {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");
  const parts = [
    ...(await Promise.all(images.map(forGemini))).map((b) => ({ inline_data: { mime_type: "image/jpeg", data: b.toString("base64") } })),
    { text },
  ];
  const { data } = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
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

// ---- Model identity ----

/** Changing any of these casts a new model; every other change (hair, size, outfit…) keeps the same person. */
const IDENTITY_FIELDS = ["gender", "age", "skin_tone"] as const;

type IdentitySource = { shoot_id: Types.ObjectId; image_id: Types.ObjectId };

/**
 * The model in a main image, as identity references: a close-up of her face (cropped once, cached on the image)
 * and the full-length photograph. Null if the image is missing.
 */
async function identityOf(src: IdentitySource): Promise<{ face: Buffer; body: Buffer } | null> {
  const shoot = await ModelShoot.findById(src.shoot_id);
  const img = shoot?.images.id(src.image_id);
  if (!img?.image?.gridfs_id) return null;
  const body = await readGridFSBuffer(BUCKET, img.image.gridfs_id);
  if (img.face?.gridfs_id) return { face: await readGridFSBuffer(BUCKET, img.face.gridfs_id), body };

  const { width = 1024, height = 1536 } = await sharp(body).metadata();
  let box = null as ReturnType<typeof toBox>;
  try {
    const r = await geminiJson<{ box_2d: number[] }>(
      [body],
      "Return box_2d [ymin, xmin, ymax, xmax] (0-1000) of the person's head, from the top of the hair to the chin.",
      { type: "OBJECT", properties: { box_2d: { type: "ARRAY", items: { type: "INTEGER" } } }, required: ["box_2d"] },
      0,
      env.GEMINI_MODEL,
    );
    box = toBox(r.box_2d);
  } catch (err) {
    console.warn(`Face box for ${src.image_id} failed, using the top-centre fallback: ${describeError(err)}`);
  }
  // Full-length studio framing puts the head in the top-centre; the fallback crops there.
  box ??= { ymin: 0, xmin: 330, ymax: 180, xmax: 670 };
  const side = Math.round(Math.min(Math.max(((box.xmax - box.xmin) / 1000) * width, ((box.ymax - box.ymin) / 1000) * height) * 1.4, width, height));
  const left = Math.round(Math.min(Math.max(((box.xmin + box.xmax) / 2000) * width - side / 2, 0), width - side));
  const top = Math.round(Math.min(Math.max(((box.ymin + box.ymax) / 2000) * height - side / 2, 0), height - side));
  const face = await sharp(body).extract({ left, top, width: side, height: side }).resize(768, 768).jpeg({ quality: 92 }).toBuffer();
  const id = await storeBuffer(face, `face_${src.shoot_id}_${src.image_id}.jpg`);
  await setImage(String(src.shoot_id), src.image_id, { face: { gridfs_id: id } });
  return { face, body };
}

/** The model on screen: the current main version if generated, else the newest generated one. */
function shownModelImage(shoot: IModelShoot) {
  const mains = shoot.images.filter((i) => i.kind === "main" && i.status === "generated");
  return mains.find((i) => i.is_current) ?? mains.sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0] ?? null;
}

/** The model a shoot stands for (compare variations): the approved main image, else the one on screen. */
function currentModelImage(shoot: IModelShoot) {
  const approved = shoot.approved_main_id ? shoot.images.id(shoot.approved_main_id) : null;
  return approved?.status === "generated" ? approved : shownModelImage(shoot);
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
      // A regenerate keeps the model already cast (same face and body); a first image or a re-cast invents her.
      const model = img.identity_ref ? await identityOf(img.identity_ref) : null;
      images = [refs.front, ...refs.closeups, ...(model ? [model.face, model.body] : [])];
      const identity = model ? { face: refs.closeups.length + 2, body: refs.closeups.length + 3 } : undefined;
      prompt = mainPrompt(shoot.garment_type, img.model_config ?? shoot.model_config, read, img.outfit ?? outfit, refs.closeups.length, identity);
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
    if (!shoot?.approved_main_id) throw new Error("No approved main image");
    const main = shoot.images.id(shoot.approved_main_id);
    if (!main?.image?.gridfs_id) throw new Error("Approved main image is missing");
    const mainBuf = await readGridFSBuffer(BUCKET, main.image.gridfs_id);
    const refs = await garmentRefs(shoot);
    // Her face, as its own reference: in a full-length photograph it is too small to survive new angles.
    const model = await identityOf({ shoot_id: shoot._id, image_id: main._id });

    const { shots } = await geminiJson<{ shots: ShotIdea[] }>(
      [mainBuf, refs.front],
      artDirectorPrompt(shoot.garment_type, imageIds.length, !!refs.back),
      ART_DIRECTOR_SCHEMA,
      0.9,
    );
    if (!shots?.length) throw new Error("The art director returned no shots");

    // Re-reads a garment read from an older version, so shots never inherit a since-fixed misreading.
    const { read } = await ensureGarmentRead(shootId, refs);
    await Promise.allSettled(imageIds.map(async (id, i) => {
      const idea = shots[i % shots.length];
      try {
        await setImage(shootId, id, { status: "generating", title: idea.title, view: idea.view, framing: idea.framing, pose: idea.pose, camera: idea.camera });
        const useBack = idea.view === "back" && !!refs.back;
        const images = useBack ? [mainBuf, refs.back!] : [mainBuf, refs.front, ...refs.closeups];
        if (model) images.push(model.face);
        const prompt = shotPrompt(shoot.garment_type, idea, read, useBack, useBack ? 0 : refs.closeups.length, model ? images.length : undefined);
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

/** Root of a concept's Stage 2 lineage: the original concept every refinement descends from. */
const rootOf = (c: { _id: Types.ObjectId; root_concept?: Types.ObjectId | null }) => c.root_concept ?? c._id;

/**
 * Starts a shoot: generates the first main image. Starting again regenerates it. Allowed for a finalised garment,
 * and for any variation in the lineage of one, so variations can be compared on the model. `outfit` (optional)
 * fixes the styling up front — compare passes the focused garment's, so only the garment differs.
 */
export async function startShoot(
  conceptId: string,
  userId: string,
  modelConfig?: Partial<IModelConfig>,
  outfit?: Partial<IOutfit>,
  identityFromShoot?: string,
) {
  if (!mongoose.Types.ObjectId.isValid(conceptId)) throw new ApiError(400, "Invalid concept id");
  const concept = await Concept.findById(conceptId).lean();
  if (!concept) throw new ApiError(404, "Concept not found");
  const workspace = await assertWorkspaceOwner(concept.workspace_id, userId);
  if (!concept.image?.gridfs_id) throw new ApiError(400, "Concept has no image yet");
  if (!concept.finalized) {
    const root = rootOf(concept);
    const inStage3 = await Concept.exists({ workspace_id: concept.workspace_id, finalized: true, $or: [{ _id: root }, { root_concept: root }] });
    if (!inStage3) throw new ApiError(400, "Move the garment to garment concepts (Stage 2 §03) first");
  }

  // Compare variations: the same model as another shoot of this workspace, not a newly cast one.
  let identity: IdentitySource | null = null;
  if (identityFromShoot) {
    const source = await loadOwnedShoot(identityFromShoot, userId);
    if (String(source.workspace_id) !== String(concept.workspace_id)) throw new ApiError(400, "That shoot belongs to another workspace");
    const img = currentModelImage(source);
    if (!img) throw new ApiError(400, "That shoot has no main image to take the model from yet");
    identity = { shoot_id: source._id, image_id: img._id };
    modelConfig = { ...source.model_config, ...(modelConfig ?? {}) };
  }

  const existing = await ModelShoot.findOne({ concept_id: concept._id });
  if (existing) return regenerateMain(String(existing._id), userId, { model_config: modelConfig, outfit }, identity);

  const shoot = new ModelShoot({
    workspace_id: concept.workspace_id,
    user_id: workspace.user_id,
    concept_id: concept._id,
    garment_type: concept.combo.silhouette_garment_type,
    model_config: cleanConfig(modelConfig, DEFAULT_MODEL_CONFIG),
    outfit: cleanOutfit(outfit, null),
  });
  const img = addMainVersion(shoot, { identity_ref: identity });
  await shoot.save();
  void renderMain(String(shoot._id), img._id);
  return { ...shootView(shoot), estimated_cost_usd: COST_SEEDREAM_EDIT };
}

const CONFIG_KEYS = Object.keys(DEFAULT_MODEL_CONFIG) as (keyof IModelConfig)[];
const OUTFIT_KEYS = ["top", "bottoms", "shoes", "accessories"] as const;
/** Model fields an edit of the image on screen can change by itself; size and height need a new take. */
const EDITABLE_CONFIG: (keyof IModelConfig)[] = ["hair"];

const isNone = (v?: string | null) => !v || v.trim().toLowerCase() === "none";
const differs = (a?: string | null, b?: string | null) => (isNone(a) ? "" : a!.trim().toLowerCase()) !== (isNone(b) ? "" : b!.trim().toLowerCase());

/** The designer's field changes as one plain edit instruction ("Change her hair to…. Change the shoes to…."). */
function changesInstruction(type: string, cfg: IModelConfig, outfit: IOutfit | null, cfgChanged: (keyof IModelConfig)[], outfitChanged: (typeof OUTFIT_KEYS)[number][]) {
  const lines: string[] = [];
  if (cfgChanged.includes("hair")) lines.push(`Change her hair to ${cfg.hair}.`);
  for (const k of outfitChanged) {
    const v = outfit?.[k];
    if (k === "top") lines.push(isNone(v) ? `Remove the top worn under the ${type}.` : `Change the top worn under the ${type} to ${v}.`);
    if (k === "bottoms") lines.push(isNone(v) ? "Remove the trousers or skirt." : `Change the bottoms to ${v}.`);
    if (k === "shoes") lines.push(isNone(v) ? "Remove the shoes." : `Change the shoes to ${v}.`);
    if (k === "accessories") lines.push(isNone(v) ? "Remove all accessories and jewellery." : `Change the accessories to ${v}.`);
  }
  return lines.join(" ");
}

/**
 * A new version of the main image.
 * - With `instruction`: edits the version on screen ("make the trousers navy").
 * - With changed fields: if only the hair or outfit pieces changed, edits the version on screen so nothing else
 *   moves; if gender, age or skin tone changed, casts a new model; otherwise (size, height, or no change at all)
 *   a new take of the same model.
 */
export async function regenerateMain(
  shootId: string,
  userId: string,
  body: { model_config?: Partial<IModelConfig>; outfit?: Partial<IOutfit>; instruction?: string },
  identityFrom?: IdentitySource | null,
) {
  const shoot = await loadOwnedShoot(shootId, userId);
  assertIdle(shoot);

  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  if (instruction.length > 500) throw new ApiError(400, "instruction must be under 500 characters");

  let fields: Partial<IShootImage> = {};
  let mode: "edit" | "new_take" | "recast";
  if (instruction) {
    const current = shoot.images.find((i) => i.kind === "main" && i.is_current);
    if (current?.status !== "generated") throw new ApiError(400, "There is no generated main image to edit");
    fields = { instruction, based_on: current._id, model_config: current.model_config, outfit: current.outfit };
    mode = "edit";
  } else {
    // Compare with the version on screen, which is what the designer is changing.
    const shown = shownModelImage(shoot);
    const baseCfg = shown?.model_config ?? shoot.model_config;
    const baseOutfit = shown?.outfit ?? shoot.outfit;
    shoot.model_config = cleanConfig(body.model_config, shoot.model_config);
    shoot.outfit = cleanOutfit(body.outfit, shoot.outfit);
    const cfgChanged = CONFIG_KEYS.filter((k) => differs(baseCfg?.[k], shoot.model_config[k]));
    const outfitChanged = OUTFIT_KEYS.filter((k) => differs(baseOutfit?.[k], shoot.outfit?.[k]));
    const recast = cfgChanged.some((k) => (IDENTITY_FIELDS as readonly string[]).includes(k));
    const editOnly = !!shown && !identityFrom && !recast && (cfgChanged.length > 0 || outfitChanged.length > 0)
      && cfgChanged.every((k) => EDITABLE_CONFIG.includes(k));

    if (editOnly) {
      fields = {
        instruction: changesInstruction(shoot.garment_type, shoot.model_config, shoot.outfit, cfgChanged, outfitChanged),
        based_on: shown!._id,
        model_config: shoot.model_config,
        outfit: shoot.outfit ?? undefined,
      };
      mode = "edit";
    } else {
      fields = { identity_ref: identityFrom ?? (!recast && shown ? { shoot_id: shoot._id, image_id: shown._id } : null) };
      mode = recast ? "recast" : "new_take";
    }
  }
  const img = addMainVersion(shoot, fields);
  await shoot.save();
  void renderMain(shootId, img._id);
  return { ...shootView(shoot), mode, estimated_cost_usd: COST_SEEDREAM_EDIT };
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

/** Normalises a Gemini box_2d [ymin, xmin, ymax, xmax] (0–1000); null if it is unusable. */
function toBox(arr: unknown) {
  if (!Array.isArray(arr) || arr.length !== 4 || !arr.every((n) => typeof n === "number")) return null;
  const [ymin, xmin, ymax, xmax] = arr.map((n) => Math.max(0, Math.min(1000, n)));
  return ymax - ymin >= 20 && xmax - xmin >= 20 ? { ymin, xmin, ymax, xmax } : null;
}

function storeBuffer(buffer: Buffer, filename: string) {
  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, { bucketName: BUCKET });
  return new Promise<Types.ObjectId>((resolve, reject) => {
    const upload = bucket.openUploadStream(filename, { contentType: "image/jpeg" });
    upload.on("error", reject);
    upload.on("finish", () => resolve(upload.id as Types.ObjectId));
    upload.end(buffer);
  });
}

/** Drops crops that show a label, tag, logo or text (brand marks must never reach the editorial). Fails open. */
async function withoutText<T extends { crop: Buffer }>(crops: T[]): Promise<T[]> {
  if (!crops.length) return crops;
  try {
    const { has_text } = await geminiJson<{ has_text: boolean[] }>(
      crops.map((c) => c.crop),
      `For each of the ${crops.length} images, in order: does it show any label, tag, logo, lettering or text? Return has_text as ${crops.length} booleans.`,
      { type: "OBJECT", properties: { has_text: { type: "ARRAY", items: { type: "BOOLEAN" } } }, required: ["has_text"] },
      0,
      env.GEMINI_MODEL,
    );
    return crops.filter((_, i) => has_text?.[i] === false);
  } catch (err) {
    console.warn(`Detail text check failed, keeping all crops: ${describeError(err)}`);
    return crops;
  }
}

/**
 * Writes (or rewrites) the garment's magazine feature. A writer agent drafts it from the hero photograph, the flat
 * and up to two shots, and picks four construction details on the flat; the editor agent then rewrites the text to
 * the house style and checks it against the photographs. Details are crops of the flat, never generated images.
 * Synchronous: ~40s.
 */
export async function writeEditorial(shootId: string, userId: string) {
  const shoot = await loadOwnedShoot(shootId, userId);
  const hero = shoot.approved_main_id ? shoot.images.id(shoot.approved_main_id) : null;
  if (!hero?.image?.gridfs_id) throw new ApiError(400, "Approve a main image before writing the editorial");

  const refs = await garmentRefs(shoot);
  const { read, outfit } = await ensureGarmentRead(shootId, refs);
  const heroBuf = await readGridFSBuffer(BUCKET, hero.image.gridfs_id);
  // Up to two shots from the newest set, preferring different views.
  const shots = shoot.images
    .filter((i) => i.kind === "shot" && i.status === "generated" && i.image?.gridfs_id)
    .sort((a, b) => (b.batch ?? 0) - (a.batch ?? 0))
    .filter((s, i, all) => all.findIndex((x) => x.view === s.view) === i)
    .slice(0, 2);
  const shotBufs = await Promise.all(shots.map((s) => readGridFSBuffer(BUCKET, s.image!.gridfs_id!)));
  const construction = constructionText(read);

  const draft = await geminiJson<Omit<EditorialText, "detail_captions"> & { details: Array<{ label: string; box_2d: unknown; caption: string }> }>(
    [heroBuf, refs.front, ...shotBufs],
    editorialWriterPrompt(shoot.garment_type, construction, outfitLine(outfit), shots.length),
    EDITORIAL_WRITER_SCHEMA,
    0.8,
  );
  // Crop every candidate from the flat, drop any that shows a label, tag, logo or text, keep the first four.
  const candidates = await Promise.all(
    (draft.details ?? []).map((d) => ({ ...d, box: toBox(d.box_2d) })).filter((d) => d.box).slice(0, 6)
      .map(async (d) => ({ ...d, crop: await cropRegion(refs.front, d.box!) })),
  );
  const details = (await withoutText(candidates)).slice(0, 4);
  if (!draft.look_name || (draft.opening ?? []).length < 2) {
    throw new ApiError(502, "The editorial could not be written; try again");
  }

  const draftText: EditorialText = {
    look_name: draft.look_name, headline: draft.headline, standfirst: draft.standfirst, hero_caption: draft.hero_caption,
    opening: draft.opening.slice(0, 3), pull_quote: draft.pull_quote, detail_captions: details.map((d) => d.caption),
    closing: (draft.closing ?? []).slice(0, 2), shot_captions: (draft.shot_captions ?? []).slice(0, shots.length),
    credit_line: draft.credit_line, fabric: draft.fabric, palette: draft.palette,
  };
  // The editor's pass; if it fails or drops structure, the writer's draft stands.
  let text = draftText;
  try {
    const edited = await geminiJson<EditorialText>(
      [heroBuf, refs.front],
      editorialEditorPrompt(shoot.garment_type, construction, draftText),
      EDITORIAL_EDITOR_SCHEMA,
      0.4,
    );
    const sameShape = edited.opening?.length === draftText.opening.length && edited.closing?.length === draftText.closing.length
      && edited.detail_captions?.length === draftText.detail_captions.length && edited.shot_captions?.length === draftText.shot_captions.length;
    if (sameShape && edited.headline && edited.standfirst) text = edited;
    else console.warn(`Model shoot ${shootId}: editor changed the feature's structure; keeping the writer's draft`);
  } catch (err) {
    console.warn(`Model shoot ${shootId}: editor pass failed, keeping the writer's draft: ${describeError(err)}`);
  }

  // Replace the previous feature's detail crops.
  const oldDetails = shoot.images.filter((i) => i.kind === "detail");
  const detailFigures: IEditorialFigure[] = [];
  for (const [i, d] of details.entries()) {
    const crop = d.crop;
    const meta = await sharp(crop).metadata();
    const img = shoot.images.create({
      kind: "detail", status: "generated", title: d.label,
      image: { gridfs_id: await storeBuffer(crop, `detail_${shootId}_${i}.jpg`), width: meta.width, height: meta.height },
    });
    shoot.images.push(img);
    detailFigures.push({ image_id: img._id, caption: text.detail_captions[i] ?? d.caption });
  }
  for (const old of oldDetails) {
    shoot.images.pull(old._id);
    if (old.image?.gridfs_id) {
      await new mongoose.mongo.GridFSBucket(mongoose.connection.db!, { bucketName: BUCKET }).delete(old.image.gridfs_id).catch(() => undefined);
    }
  }

  // The look's name is a proper noun wherever it appears ("The Chestnut jacket", not "The chestnut jacket").
  const lookName = text.look_name.trim().charAt(0).toUpperCase() + text.look_name.trim().slice(1);
  const headline = text.headline.replace(new RegExp(`\\b${lookName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), lookName);
  const copy: IEditorialCopy = {
    version: EDITORIAL_VERSION,
    look_name: lookName,
    headline,
    standfirst: text.standfirst,
    hero_caption: text.hero_caption,
    opening: text.opening,
    pull_quote: text.pull_quote,
    details: detailFigures,
    closing: text.closing,
    shots: shots.map((s, i) => ({ image_id: s._id, caption: text.shot_captions[i] ?? "" })),
    credit_line: text.credit_line,
    fabric: text.fabric,
    palette: text.palette,
    generated_at: new Date(),
  };
  shoot.editorial = copy;
  shoot.markModified("editorial");
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

/**
 * The Stage 2 variations of a garment, for the compare view: the garment's whole lineage (the original and every
 * live refinement), each with its shoot if it has one. Oldest first.
 */
export async function listVariations(conceptId: string, userId: string) {
  if (!mongoose.Types.ObjectId.isValid(conceptId)) throw new ApiError(400, "Invalid concept id");
  const concept = await Concept.findById(conceptId).lean();
  if (!concept) throw new ApiError(404, "Concept not found");
  await assertWorkspaceOwner(concept.workspace_id, userId);
  const root = rootOf(concept);
  const variations = await Concept.find({
    workspace_id: concept.workspace_id,
    $or: [{ _id: root }, { root_concept: root }],
    undone: { $ne: true },
    status: { $in: ["generated", "approved"] },
    "image.gridfs_id": { $exists: true },
  }).sort({ createdAt: 1 }).lean();
  const shoots = await ModelShoot.find({ concept_id: { $in: variations.map((v) => v._id) } });
  await Promise.all(shoots.map(sweepStale));
  const byConcept = new Map(shoots.map((s) => [String(s.concept_id), s]));
  return {
    concept_id: conceptId,
    variations: variations.map((v) => {
      const shoot = byConcept.get(String(v._id));
      return {
        concept_id: String(v._id),
        accumulated_edits: v.accumulated_edits ?? [],
        finalized: !!v.finalized,
        front_image_url: `/api/v1/concepts/${v._id}/image`,
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
