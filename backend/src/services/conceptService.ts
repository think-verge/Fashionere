import mongoose from "mongoose";
import axios from "axios";
import { env } from "../config/env.js";
import { ApiError } from "../utils/api-error.js";
import { Workspace, type IWorkspaceElement } from "../models/Workspace.js";
import { GenerationJob, type IComboRef, type IDiscardedCombo } from "../models/GenerationJob.js";
import { Concept, type IConcept } from "../models/Concept.js";
import { evaluateCombos, type CoherenceResult } from "./coherenceFilter.js";

const FAL_QUEUE_URL = "https://queue.fal.run/fal-ai/flux-pro/kontext";
const FAL_SEEDREAM_QUEUE_URL = "https://queue.fal.run/fal-ai/bytedance/seedream/v4/edit";
const FAL_STATUS_BASE = "https://queue.fal.run/fal-ai/flux-pro/kontext/requests";
const COST_PER_IMAGE = 0.04;
const COST_SEEDREAM = 0.03;
const MAX_COMBOS = 10;
const POLL_INTERVAL_MS = 5000;

function falHeaders() {
  return {
    Authorization: `Key ${env.FAL_KEY}`,
    "Content-Type": "application/json",
  };
}

function gridfsIdFromUrl(url: string): string | null {
  const match = url.match(/\/([a-f0-9]{24})$/);
  return match ? match[1] : null;
}

async function readGridFSAsDataUri(gridfsId: string, bucketName = "swatches"): Promise<string> {
  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, { bucketName });
  const objectId = new mongoose.Types.ObjectId(gridfsId);

  const chunks: Buffer[] = [];
  const stream = bucket.openDownloadStream(objectId);

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const buffer = Buffer.concat(chunks);
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

async function resolveImageForFal(url: string): Promise<string> {
  // Case 1: GridFS URL (e.g. ending in a 24-char hex id) → convert to base64 data URI
  const gridfsId = gridfsIdFromUrl(url);
  if (gridfsId) {
    return readGridFSAsDataUri(gridfsId);
  }

  // Case 2: External public URL → pass through directly
  return url;
}

interface ResolvedIngredient {
  id: string;
  label: string;
  brand: string;
  garment_type: string;
  element_type: string;
  fabric_family?: string;
  image_url?: string;
  hex?: string;
  color_name?: string;
}

function resolveIngredients(elements: IWorkspaceElement[]): {
  silhouettes: ResolvedIngredient[];
  fabrics: ResolvedIngredient[];
  patterns: ResolvedIngredient[];
  colors: ResolvedIngredient[];
} {
  const silhouettes: ResolvedIngredient[] = [];
  const fabrics: ResolvedIngredient[] = [];
  const patterns: ResolvedIngredient[] = [];
  const colors: ResolvedIngredient[] = [];

  for (const el of elements) {
    const d = el.data as Record<string, unknown>;
    const fabricObj = d.fabric as Record<string, unknown> | undefined;

    const base: ResolvedIngredient = {
      id: el.element_id,
      label: (d.name ?? d.label ?? d.piece ?? fabricObj?.name ?? d.pattern ?? el.element_id) as string,
      brand: el.source_brand || "unknown",
      garment_type: el.garment_type || (d.garment_type as string) || "jacket",
      element_type: el.element_type,
    };

    switch (el.element_type) {
      case "silhouette": {
        silhouettes.push({
          ...base,
          label: (d.garment_type as string) || base.label,
          image_url: (d.flat_url ?? d.image_url) as string | undefined,
        });
        break;
      }
      case "fabric": {
        const material = (fabricObj?.material ?? d.material ?? "") as string;
        fabrics.push({
          ...base,
          label: (fabricObj?.name ?? d.name ?? base.label) as string,
          fabric_family: material,
          image_url: (d.image_url ?? fabricObj?.image_url) as string | undefined,
        });
        break;
      }
      case "pattern": {
        patterns.push({
          ...base,
          label: (d.pattern ?? d.motif ?? d.name ?? base.label) as string,
          image_url: (d.image_url) as string | undefined,
        });
        break;
      }
      case "color": {
        const colorsArr = d.colors as Array<{ hex?: string; name?: string }> | undefined;
        if (colorsArr?.length) {
          const primary = colorsArr[0];
          colors.push({
            ...base,
            hex: (primary.hex?.startsWith("#") ? primary.hex : `#${primary.hex}`) || "#000000",
            color_name: primary.name || "Unknown",
          });
        } else {
          colors.push({
            ...base,
            hex: (d.hex ?? d.color ?? "#000000") as string,
            color_name: (d.name ?? d.color_name ?? "Unknown") as string,
          });
        }
        break;
      }
    }
  }

  return { silhouettes, fabrics, patterns, colors };
}

function buildComboMatrix(
  silhouettes: ResolvedIngredient[],
  fabrics: ResolvedIngredient[],
  patterns: ResolvedIngredient[],
  colors: ResolvedIngredient[],
): IComboRef[] {
  const combos: IComboRef[] = [];
  const patternList = patterns.length > 0 ? patterns : [null];

  for (const s of silhouettes) {
    for (const f of fabrics) {
      for (const p of patternList) {
        for (const c of colors) {
          const isSelfReconstruction =
            s.brand === f.brand &&
            (!p || p.brand === s.brand) &&
            s.brand !== "unknown";

          if (isSelfReconstruction && silhouettes.length > 1) continue;

          combos.push({
            silhouette_id: s.id,
            silhouette_label: s.label,
            silhouette_brand: s.brand,
            silhouette_garment_type: s.garment_type,
            fabric_id: f.id,
            fabric_label: f.label,
            fabric_family: f.fabric_family || "",
            fabric_brand: f.brand,
            pattern_id: p?.id ?? null,
            pattern_label: p?.label ?? null,
            pattern_brand: p?.brand ?? null,
            color: { hex: c.hex!, name: c.color_name! },
          });
        }
      }
    }
  }

  return combos;
}

function buildPrompt(combo: IComboRef): string {
  let prompt = `Transform this garment into a new fashion concept: render it in ${combo.color.name} (${combo.color.hex}) ${combo.fabric_label} fabric.`;

  if (combo.pattern_label) {
    prompt += ` Apply a ${combo.pattern_label} pattern on the surface.`;
  }

  prompt += ` Keep the exact silhouette — preserve all structural details, proportions, closures, pockets, and construction lines of the original garment.`;
  prompt += ` Remove all brand logos, labels, and text. This is an unbranded fashion concept.`;
  prompt += ` Flat-lay product shot on a clean white background, fashion photography, high detail, studio lighting.`;

  return prompt;
}

function getSilhouetteImageUrl(
  elements: IWorkspaceElement[],
  silhouetteId: string,
): string | null {
  const el = elements.find((e) => e.element_id === silhouetteId && e.element_type === "silhouette");
  if (!el) return null;
  const d = el.data as Record<string, unknown>;
  return (d.flat_url ?? d.image_url) as string | null ?? null;
}

async function submitToFal(imageUrl: string, prompt: string, guidanceScale = 3.5): Promise<{ requestId: string; statusUrl: string; responseUrl: string }> {
  const resp = await axios.post(
    FAL_QUEUE_URL,
    {
      image_url: imageUrl,
      prompt,
      guidance_scale: guidanceScale,
      num_images: 1,
      output_format: "jpeg",
      safety_tolerance: 6,
    },
    { headers: falHeaders() },
  );
  return {
    requestId: resp.data.request_id,
    statusUrl: resp.data.status_url,
    responseUrl: resp.data.response_url,
  };
}

function getGuidanceScale(editType: EditType): number {
  switch (editType) {
    case "silhouette": return 8;
    case "pattern": return 7;
    case "multi": return 6;
    default: return 3.5;
  }
}

async function pollFalResult(statusUrl: string, responseUrl: string): Promise<{ imageUrl: string; inferenceTime: number } | null> {
  const statusResp = await axios.get(statusUrl, { headers: falHeaders(), validateStatus: () => true });
  if (statusResp.status !== 200 || statusResp.data.status !== "COMPLETED") return null;

  const resultResp = await axios.get(responseUrl, { headers: falHeaders() });
  const data = resultResp.data;
  const imageUrl = data.images?.[0]?.url ?? data.image?.url ?? null;
  const inferenceTime = data.metrics?.inference_time ?? statusResp.data.metrics?.inference_time ?? 0;
  return imageUrl ? { imageUrl, inferenceTime } : null;
}

async function downloadAndStoreImage(imageUrl: string): Promise<{ gridfsId: mongoose.Types.ObjectId; size: number }> {
  const MAX_DOWNLOAD_ATTEMPTS = 4;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_DOWNLOAD_ATTEMPTS; attempt++) {
    try {
      const resp = await axios.get(imageUrl, { responseType: "arraybuffer", timeout: 30_000 });
      const buffer = Buffer.from(resp.data);

      const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, { bucketName: "concepts" });
      const filename = `concept_${Date.now()}.jpg`;

      return await new Promise((resolve, reject) => {
        const uploadStream = bucket.openUploadStream(filename, { contentType: "image/jpeg" });
        uploadStream.on("error", reject);
        uploadStream.on("finish", () => {
          resolve({ gridfsId: uploadStream.id as mongoose.Types.ObjectId, size: buffer.length });
        });
        uploadStream.end(buffer);
      });
    } catch (err: any) {
      lastError = err;
      const status = err?.response?.status;
      // Only retry on 5xx (server errors) or network timeouts — not 4xx client errors
      if (status && status < 500) throw err;
      if (attempt < MAX_DOWNLOAD_ATTEMPTS) {
        const delayMs = 2000 * attempt; // 2s, 4s, 6s
        console.warn(`[downloadAndStoreImage] Attempt ${attempt} failed (${status ?? "network error"}), retrying in ${delayMs}ms...`);
        await sleep(delayMs);
      }
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---- SSE support ----

type SSEClient = {
  res: import("express").Response;
  jobId: string;
};

const sseClients = new Map<string, Set<SSEClient>>();

export function addSSEClient(jobId: string, client: SSEClient) {
  if (!sseClients.has(jobId)) sseClients.set(jobId, new Set());
  sseClients.get(jobId)!.add(client);
}

export function removeSSEClient(jobId: string, client: SSEClient) {
  sseClients.get(jobId)?.delete(client);
  if (sseClients.get(jobId)?.size === 0) sseClients.delete(jobId);
}

function emitSSE(jobId: string, event: string, data: unknown) {
  const clients = sseClients.get(jobId);
  if (!clients) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    client.res.write(payload);
  }
}

// ---- Main pipeline ----

export async function generateConcepts(
  workspaceId: string,
  userId: string,
  mode: "manual" | "suggest",
  manualCombo?: IComboRef,
  maxCombos = MAX_COMBOS,
) {
  const workspace = await Workspace.findOne({ _id: workspaceId, user_id: userId });
  if (!workspace) throw new ApiError(404, "Workspace not found");

  if (!workspace.elements?.length) {
    throw new ApiError(400, "Workspace has no ingredients");
  }

  workspace.status = "generating";
  await workspace.save();

  const { silhouettes, fabrics, patterns, colors } = resolveIngredients(workspace.elements);

  if (!silhouettes.length) throw new ApiError(400, "Workspace has no silhouettes");
  if (!fabrics.length) throw new ApiError(400, "Workspace has no fabrics");
  if (!colors.length) throw new ApiError(400, "Workspace has no colors");

  let allCombos: IComboRef[];
  if (mode === "manual" && manualCombo) {
    allCombos = [manualCombo];
  } else {
    allCombos = buildComboMatrix(silhouettes, fabrics, patterns, colors);
  }

  // Prevent duplicate generations by filtering out combos that already exist
  const existingConcepts = await Concept.find({ workspace_id: workspaceId }).lean();
  allCombos = allCombos.filter((combo) => {
    return !existingConcepts.some(
      (ec) =>
        !ec.parent_concept && // Only check root concepts
        ec.combo &&
        ec.combo.silhouette_id === combo.silhouette_id &&
        ec.combo.fabric_id === combo.fabric_id &&
        ec.combo.color.hex === combo.color.hex &&
        (ec.combo.pattern_id ?? null) === (combo.pattern_id ?? null)
    );
  });

  const matrixSize = allCombos.length;
  const { passed, killed } = evaluateCombos(allCombos);

  const cappedPassed = passed.slice(0, Math.min(maxCombos, MAX_COMBOS));
  const estimatedCost = cappedPassed.length * COST_PER_IMAGE;

  const job = await GenerationJob.create({
    workspace_id: workspaceId,
    user_id: userId,
    mode,
    combos_total: cappedPassed.length,
    combos_completed: 0,
    combos_killed: killed.length,
    combos_matrix_size: matrixSize,
    estimated_cost_usd: estimatedCost,
    total_cost_usd: 0,
    combos: [],
    discarded_combos: killed.map((k) => ({
      ...k.combo,
      coherence: k.coherence,
    })),
    status: "queued",
  });

  if (cappedPassed.length > 0) {
    runGeneration(job._id.toString(), cappedPassed, workspace.elements, userId, workspaceId).catch((err) => {
      console.error(`Generation failed for job ${job._id}:`, err);
      Workspace.updateOne({ _id: workspaceId }, { status: "ready" }).catch(() => {});
    });
  } else {
    await GenerationJob.updateOne({ _id: job._id }, { status: "completed", completed_at: new Date() });
    await Workspace.updateOne({ _id: workspaceId }, { status: "ready" });
  }

  return {
    job_id: job._id,
    combos_to_generate: cappedPassed.length,
    combos_killed: killed.length,
    combos_matrix_size: matrixSize,
    estimated_cost_usd: estimatedCost,
    combos: cappedPassed.map((p) => ({
      ...p.combo,
      coherence: p.coherence,
    })),
    discarded_combos: killed.map((k) => ({
      ...k.combo,
      coherence: k.coherence,
    })),
    stream_url: `/concepts/generate/${job._id}/stream`,
  };
}

async function runGeneration(
  jobId: string,
  combos: CoherenceResult[],
  elements: IWorkspaceElement[],
  userId: string,
  workspaceId?: string,
) {
  await GenerationJob.updateOne({ _id: jobId }, { status: "running", started_at: new Date() });

  const concepts: Array<{ conceptId: string; requestId: string; statusUrl: string; responseUrl: string; combo: CoherenceResult }> = [];

  for (const cr of combos) {
    const prompt = buildPrompt(cr.combo);
    const imageUrl = getSilhouetteImageUrl(elements, cr.combo.silhouette_id);

    if (!imageUrl) {
      console.warn(`No image URL for silhouette ${cr.combo.silhouette_id}, skipping`);
      continue;
    }

    let resolvedImageUrl: string;
    try {
      resolvedImageUrl = await resolveImageForFal(imageUrl);
    } catch (err) {
      console.error(`Failed to resolve image for silhouette ${cr.combo.silhouette_id}:`, err);
      continue;
    }

    const concept = await Concept.create({
      workspace_id: (await GenerationJob.findById(jobId))!.workspace_id,
      job_id: jobId,
      combo: cr.combo,
      image: {},
      generation: {
        model: "fal-ai/flux-pro/kontext",
        prompt,
      },
      coherence: cr.coherence,
      status: "generating",
    });

    try {
      const { requestId, statusUrl, responseUrl } = await submitToFal(resolvedImageUrl, prompt);
      await Concept.updateOne({ _id: concept._id }, { "generation.fal_request_id": requestId });
      concepts.push({ conceptId: concept._id.toString(), requestId, statusUrl, responseUrl, combo: cr });
    } catch (err) {
      console.error(`FAL submission failed for concept ${concept._id}:`, err);
      await Concept.updateOne({ _id: concept._id }, { status: "failed" });
    }
  }

  if (concepts.length === 0) {
    await GenerationJob.updateOne(
      { _id: jobId },
      { status: "completed", completed_at: new Date(), combos_total: 0 },
    );
    if (workspaceId) {
      await Workspace.updateOne({ _id: workspaceId }, { status: "ready" });
    }
    emitSSE(jobId, "job_done", { status: "completed", total_cost_usd: 0, concepts_count: 0 });
    return;
  }

  await GenerationJob.updateOne({ _id: jobId }, { combos_total: concepts.length });

  let completed = 0;
  let totalCost = 0;
  const pending = new Set(concepts.map((c) => c.conceptId));
  const MAX_POLL_ATTEMPTS = 60;
  let pollAttempts = 0;

  while (pending.size > 0 && pollAttempts < MAX_POLL_ATTEMPTS) {
    await sleep(POLL_INTERVAL_MS);
    pollAttempts++;

    for (const c of concepts) {
      if (!pending.has(c.conceptId)) continue;

      try {
        const result = await pollFalResult(c.statusUrl, c.responseUrl);
        if (!result) continue;

        const { gridfsId } = await downloadAndStoreImage(result.imageUrl);

        await Concept.updateOne(
          { _id: c.conceptId },
          {
            "image.gridfs_id": gridfsId,
            "image.width": 1024,
            "image.height": 1024,
            "image.format": "jpeg",
            "generation.inference_time_s": result.inferenceTime,
            "generation.cost_usd": COST_PER_IMAGE,
            status: "generated",
          },
        );

        completed++;
        totalCost += COST_PER_IMAGE;
        pending.delete(c.conceptId);

        await GenerationJob.updateOne(
          { _id: jobId },
          {
            combos_completed: completed,
            total_cost_usd: totalCost,
            $push: { combos: { concept_id: c.conceptId, coherence_score: c.combo.coherence.score } },
          },
        );

        emitSSE(jobId, "concept_ready", {
          concept_id: c.conceptId,
          combo: c.combo.combo,
          coherence: c.combo.coherence,
          inference_time_s: result.inferenceTime,
        });

        emitSSE(jobId, "progress", {
          completed,
          total: concepts.length,
          cost_so_far: totalCost,
        });
      } catch (err) {
        console.error(`Poll/store failed for concept ${c.conceptId}:`, err);
        await Concept.updateOne({ _id: c.conceptId }, { status: "failed" });
        pending.delete(c.conceptId);
        completed++;
      }
    }
  }

  if (pending.size > 0) {
    for (const c of concepts) {
      if (pending.has(c.conceptId)) {
        await Concept.updateOne({ _id: c.conceptId }, { status: "failed" });
        console.error(`Concept ${c.conceptId} timed out after ${MAX_POLL_ATTEMPTS} polls`);
      }
    }
  }

  const finalStatus = completed === concepts.length ? "completed" : "partial_failure";
  await GenerationJob.updateOne(
    { _id: jobId },
    { status: finalStatus, completed_at: new Date(), total_cost_usd: totalCost },
  );

  if (workspaceId) {
    await Workspace.updateOne({ _id: workspaceId }, { status: "ready" });
  }

  emitSSE(jobId, "job_done", {
    status: finalStatus,
    total_cost_usd: totalCost,
    concepts_count: completed,
  });
}

// ---- Override ----

export async function overrideCombos(jobId: string, userId: string, comboRefs: IComboRef[]) {
  const job = await GenerationJob.findOne({ _id: jobId, user_id: userId });
  if (!job) throw new ApiError(404, "Generation job not found");

  const workspace = await Workspace.findById(job.workspace_id).lean();
  if (!workspace) throw new ApiError(404, "Workspace not found");

  const overrideResults: CoherenceResult[] = [];
  const remainingDiscarded: IDiscardedCombo[] = [];

  for (const discarded of job.discarded_combos) {
    const isOverridden = comboRefs.some(
      (c) =>
        c.silhouette_id === discarded.silhouette_id &&
        c.fabric_id === discarded.fabric_id &&
        c.color.hex === discarded.color.hex &&
        (c.pattern_id ?? null) === (discarded.pattern_id ?? null),
    );

    if (isOverridden) {
      overrideResults.push({
        combo: discarded as IComboRef,
        coherence: {
          ...discarded.coherence,
          overridden: true,
          overridden_by: new mongoose.Types.ObjectId(userId),
        },
      });
    } else {
      remainingDiscarded.push(discarded);
    }
  }

  if (!overrideResults.length) {
    throw new ApiError(400, "None of the provided combos match a discarded combo");
  }

  await GenerationJob.updateOne(
    { _id: jobId },
    {
      discarded_combos: remainingDiscarded,
      combos_total: job.combos_total + overrideResults.length,
      estimated_cost_usd: job.estimated_cost_usd + overrideResults.length * COST_PER_IMAGE,
      status: "running",
    },
  );

  runGeneration(jobId, overrideResults, workspace.elements, userId).catch((err) => {
    console.error(`Override generation failed for job ${jobId}:`, err);
  });

  return {
    job_id: jobId,
    overridden_count: overrideResults.length,
    combos: overrideResults.map((r) => ({
      ...r.combo,
      coherence: r.coherence,
    })),
    stream_url: `/concepts/generate/${jobId}/stream`,
  };
}

// ---- Query helpers ----

export async function getJob(jobId: string, userId: string) {
  const job = await GenerationJob.findOne({ _id: jobId, user_id: userId }).lean();
  if (!job) throw new ApiError(404, "Generation job not found");
  return job;
}

export async function listConcepts(workspaceId: string, userId: string, status?: string, jobId?: string) {
  const filter: Record<string, unknown> = { workspace_id: workspaceId };
  if (status) filter.status = status;
  if (jobId) filter.job_id = jobId;

  const workspace = await Workspace.findOne({ _id: workspaceId, user_id: userId }).lean();
  if (!workspace) throw new ApiError(404, "Workspace not found");

  return Concept.find(filter).sort({ createdAt: -1 }).lean();
}

export async function getConcept(conceptId: string, userId: string) {
  const concept = await Concept.findById(conceptId).lean();
  if (!concept) throw new ApiError(404, "Concept not found");

  const workspace = await Workspace.findOne({ _id: concept.workspace_id, user_id: userId }).lean();
  if (!workspace) throw new ApiError(403, "Not authorized");

  return concept;
}

export async function updateConceptStatus(conceptId: string, userId: string, status: "approved" | "rejected") {
  const concept = await Concept.findById(conceptId);
  if (!concept) throw new ApiError(404, "Concept not found");

  const workspace = await Workspace.findOne({ _id: concept.workspace_id, user_id: userId }).lean();
  if (!workspace) throw new ApiError(403, "Not authorized");

  concept.status = status;
  await concept.save();
  return concept.toObject();
}

export async function getConceptImage(conceptId: string, userId: string) {
  const concept = await Concept.findById(conceptId).lean();
  if (!concept) throw new ApiError(404, "Concept not found");
  if (!concept.image?.gridfs_id) throw new ApiError(404, "Concept image not yet generated");

  const workspace = await Workspace.findOne({ _id: concept.workspace_id, user_id: userId }).lean();
  if (!workspace) throw new ApiError(403, "Not authorized");

  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, { bucketName: "concepts" });
  return bucket.openDownloadStream(concept.image.gridfs_id);
}

// ---- Edit type classification ----

type EditType = "color" | "silhouette" | "pattern" | "detail" | "multi";

const COLOR_KEYWORDS = ["color", "colour", "shade", "hue", "dye", "tint", "tone", "navy", "red", "blue", "green", "black", "white", "pink", "beige", "cream", "grey", "gray", "brown", "orange", "yellow", "purple", "burgundy", "maroon", "olive", "teal", "coral", "ivory", "charcoal", "pastel", "darker", "lighter", "brighter", "muted", "vibrant", "saturated", "desaturated"];
const SILHOUETTE_KEYWORDS = ["sleeve", "sleeves", "collar", "collars", "lapel", "lapels", "hem", "hemline", "length", "longer", "lengthen", "shorter", "shorten", "wider", "widen", "narrower", "narrow", "slim", "slimmer", "oversized", "fitted", "relaxed", "cropped", "crop", "extended", "extend", "flared", "flare", "tapered", "taper", "dropped", "drop", "raised", "raise", "neckline", "cuff", "cuffs", "waist", "waistline", "shoulder", "shoulders", "vent", "slit", "pleat", "pleats", "tuck", "dart"];
const PATTERN_KEYWORDS = ["pattern", "print", "stripe", "check", "plaid", "tartan", "floral", "geometric", "abstract", "polka", "dot", "houndstooth", "herringbone", "paisley", "animal", "leopard", "zebra", "camo", "camouflage", "solid", "plain", "motif", "tile", "repeat"];

function classifyEditType(instruction: string): EditType {
  const lower = instruction.toLowerCase();
  const wordMatch = (kw: string) => new RegExp(`\\b${kw}\\b`).test(lower);

  const colorCount = COLOR_KEYWORDS.filter(wordMatch).length;
  const silhouetteCount = SILHOUETTE_KEYWORDS.filter(wordMatch).length;
  const patternCount = PATTERN_KEYWORDS.filter(wordMatch).length;

  // Pattern descriptions naturally include color words ("red tartan plaid").
  // Only escalate to multi when silhouette is also involved.
  if (patternCount > 0 && colorCount > 0 && silhouetteCount === 0) return "pattern";
  if (silhouetteCount > 0 && colorCount > 0 && patternCount === 0) {
    if (silhouetteCount > colorCount * 2) return "silhouette";
    if (colorCount > silhouetteCount * 2) return "color";
    return "multi";
  }

  const categories = [
    { type: "color" as EditType, count: colorCount },
    { type: "silhouette" as EditType, count: silhouetteCount },
    { type: "pattern" as EditType, count: patternCount },
  ].filter((c) => c.count > 0);

  if (categories.length === 0) return "detail";
  if (categories.length === 1) return categories[0].type;

  categories.sort((a, b) => b.count - a.count);
  if (categories[0].count >= categories[1].count * 2) return categories[0].type;
  return "multi";
}

// ---- Accumulated prompt builder ----

function describeCurrentState(combo: IConcept["combo"], accumulatedEdits: string[]): string {
  if (accumulatedEdits.length > 0) {
    return `a ${combo.silhouette_garment_type} that has been modified: ${accumulatedEdits.join("; ")}`;
  }
  let desc = `a ${combo.silhouette_garment_type} in ${combo.color.name} (${combo.color.hex}) ${combo.fabric_label} fabric`;
  if (combo.pattern_label) desc += ` with a ${combo.pattern_label} pattern`;
  return desc;
}

function buildStructuralRefinePrompt(
  combo: IConcept["combo"],
  accumulatedEdits: string[],
  newInstruction: string,
): string {
  const current = describeCurrentState(combo, accumulatedEdits);
  let prompt = `This image shows ${current}.`;
  prompt += ` IMPORTANT STRUCTURAL CHANGE REQUIRED: ${newInstruction}.`;
  prompt += ` This must be a VISIBLE, DRAMATIC change to the garment's shape and proportions — not subtle.`;
  prompt += ` The modification should be clearly obvious when comparing before and after.`;
  prompt += ` Preserve the fabric, color, texture, and all other non-structural details exactly.`;
  prompt += ` No brand logos or text. Flat-lay product shot, clean white background, studio lighting.`;
  return prompt;
}

function buildPatternRefinePrompt(
  combo: IConcept["combo"],
  accumulatedEdits: string[],
  newInstruction: string,
): string {
  const current = describeCurrentState(combo, accumulatedEdits);
  let prompt = `This image shows ${current}.`;
  prompt += ` COMPLETELY REPLACE the surface pattern/print of this garment: ${newInstruction}.`;
  prompt += ` The new pattern must cover EVERY visible fabric surface of the garment.`;
  prompt += ` The pattern change must be bold and unmistakable — not a subtle texture shift.`;
  prompt += ` Keep the exact silhouette, shape, proportions, closures, and construction unchanged.`;
  prompt += ` No brand logos or text. Flat-lay product shot, clean white background, studio lighting.`;
  return prompt;
}

function buildRefinePrompt(
  combo: IConcept["combo"],
  accumulatedEdits: string[],
  newInstruction: string,
  editType: EditType,
): string {
  if (editType === "silhouette") {
    return buildStructuralRefinePrompt(combo, accumulatedEdits, newInstruction);
  }
  if (editType === "pattern") {
    return buildPatternRefinePrompt(combo, accumulatedEdits, newInstruction);
  }

  const current = describeCurrentState(combo, accumulatedEdits);
  let prompt = `This image shows ${current}.`;
  prompt += ` Now apply this edit: ${newInstruction}.`;
  prompt += ` Keep all other details of the garment exactly as they are — preserve structural proportions, closures, pockets, and construction lines.`;
  prompt += ` No brand logos, labels, or text. Unbranded fashion concept.`;
  prompt += ` Flat-lay product shot on a clean white background, fashion photography, high detail, studio lighting.`;
  return prompt;
}

// ---- Seedream submission (for color/silhouette edits) ----

interface FalQueueResponse {
  request_id: string;
  status_url: string;
  response_url: string;
}

async function submitToSeedream(imageUrl: string, prompt: string): Promise<FalQueueResponse> {
  const resp = await axios.post(
    FAL_SEEDREAM_QUEUE_URL,
    {
      image_urls: [imageUrl],
      prompt,
      image_size: "square",
      enable_safety_checker: false,
    },
    { headers: falHeaders() },
  );
  return {
    request_id: resp.data.request_id,
    status_url: resp.data.status_url,
    response_url: resp.data.response_url,
  };
}

async function pollFalQueueResult(statusUrl: string, responseUrl: string): Promise<{ imageUrl: string; inferenceTime: number } | null> {
  const statusResp = await axios.get(statusUrl, { headers: falHeaders(), validateStatus: () => true });

  if (statusResp.status === 200 && statusResp.data.status === "COMPLETED") {
    const resultResp = await axios.get(responseUrl, { headers: falHeaders() });
    const data = resultResp.data;
    const imageUrl = data.images?.[0]?.url ?? data.image?.url ?? null;
    const inferenceTime = data.metrics?.inference_time ?? 0;
    return imageUrl ? { imageUrl, inferenceTime } : null;
  }

  return null;
}

// ---- Refine pipeline ----

export async function refineConcept(
  conceptId: string,
  userId: string,
  instruction: string,
) {
  const parentConcept = await Concept.findById(conceptId);
  if (!parentConcept) throw new ApiError(404, "Concept not found");
  if (!parentConcept.image?.gridfs_id) throw new ApiError(400, "Parent concept has no image yet");

  const workspace = await Workspace.findOne({ _id: parentConcept.workspace_id, user_id: userId }).lean();
  if (!workspace) throw new ApiError(403, "Not authorized");

  const editType = classifyEditType(instruction);

  const rootId = parentConcept.root_concept ?? parentConcept._id;
  const prevEdits = parentConcept.accumulated_edits ?? [];
  const accumulatedEdits = [...prevEdits, instruction];

  const prompt = buildRefinePrompt(parentConcept.combo, prevEdits, instruction, editType);

  const parentImageDataUri = await readGridFSAsDataUri(
    parentConcept.image.gridfs_id.toString(),
    "concepts",
  );

  // Only color edits go to Seedream; structural + pattern + detail → Kontext with high guidance
  const useSeedream = editType === "color";
  const model = useSeedream ? "fal-ai/bytedance/seedream/v4/edit" : "fal-ai/flux-pro/kontext";
  const cost = useSeedream ? COST_SEEDREAM : COST_PER_IMAGE;

  const variant = await Concept.create({
    workspace_id: parentConcept.workspace_id,
    job_id: parentConcept.job_id,
    parent_concept: parentConcept._id,
    root_concept: rootId,
    edit_instruction: instruction,
    accumulated_edits: accumulatedEdits,
    edit_type: editType,
    combo: parentConcept.combo,
    image: {},
    generation: { model, prompt },
    coherence: parentConcept.coherence,
    status: "generating",
  });

  runRefineGeneration(
    variant._id.toString(),
    parentImageDataUri,
    prompt,
    useSeedream,
    editType,
  ).catch((err) => {
    console.error(`Refine generation failed for variant ${variant._id}:`, err);
  });

  return {
    variant_id: variant._id,
    parent_concept_id: parentConcept._id,
    root_concept_id: rootId,
    edit_type: editType,
    model,
    estimated_cost_usd: cost,
    accumulated_edits: accumulatedEdits,
    status: "generating",
  };
}

async function runRefineGeneration(
  variantId: string,
  imageDataUri: string,
  prompt: string,
  useSeedream: boolean,
  editType: EditType = "detail",
) {
  try {
    let statusUrl: string;
    let responseUrl: string;
    let requestId: string;

    if (useSeedream) {
      try {
        const queueResp = await submitToSeedream(imageDataUri, prompt);
        requestId = queueResp.request_id;
        statusUrl = queueResp.status_url;
        responseUrl = queueResp.response_url;
      } catch (err) {
        console.warn(`Seedream failed, falling back to Kontext for variant ${variantId}:`, err);
        const gs = getGuidanceScale(editType);
        const falResp = await submitToFal(imageDataUri, prompt, gs);
        requestId = falResp.requestId;
        statusUrl = falResp.statusUrl;
        responseUrl = falResp.responseUrl;
        await Concept.updateOne({ _id: variantId }, { "generation.model": "fal-ai/flux-pro/kontext" });
      }
    } else {
      const gs = getGuidanceScale(editType);
      const falResp = await submitToFal(imageDataUri, prompt, gs);
      requestId = falResp.requestId;
      statusUrl = falResp.statusUrl;
      responseUrl = falResp.responseUrl;
    }

    await Concept.updateOne({ _id: variantId }, { "generation.fal_request_id": requestId });

    const MAX_POLL = 60;
    let attempts = 0;

    while (attempts < MAX_POLL) {
      await sleep(POLL_INTERVAL_MS);
      attempts++;

      const result = await pollFalQueueResult(statusUrl, responseUrl).catch(() => null);
      if (!result) continue;

      const { gridfsId } = await downloadAndStoreImage(result.imageUrl);
      const cost = useSeedream ? COST_SEEDREAM : COST_PER_IMAGE;

      await Concept.updateOne(
        { _id: variantId },
        {
          "image.gridfs_id": gridfsId,
          "image.width": 1024,
          "image.height": 1024,
          "image.format": "jpeg",
          "generation.inference_time_s": result.inferenceTime,
          "generation.cost_usd": cost,
          status: "generated",
        },
      );

      return;
    }

    await Concept.updateOne({ _id: variantId }, { status: "failed" });
    console.error(`Variant ${variantId} timed out after ${MAX_POLL} polls`);
  } catch (err) {
    await Concept.updateOne({ _id: variantId }, { status: "failed" });
    throw err;
  }
}

export async function getVariants(conceptId: string, userId: string) {
  const concept = await Concept.findById(conceptId);
  if (!concept) throw new ApiError(404, "Concept not found");

  const workspace = await Workspace.findOne({ _id: concept.workspace_id, user_id: userId }).lean();
  if (!workspace) throw new ApiError(403, "Not authorized");

  const rootId = concept.root_concept ?? concept._id;
  return Concept.find({ root_concept: rootId }).sort({ createdAt: 1 }).lean();
}
