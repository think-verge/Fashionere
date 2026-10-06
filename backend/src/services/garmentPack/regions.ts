import axios from "axios";
import sharp from "sharp";
import { env } from "../../config/env.js";
import type { FeatureType } from "../../models/GarmentPack.js";
import { describeError } from "../falQueue.js";
import { FEATURE_TYPES, canonicalGarment, garmentAnalysisPrompt } from "./prompts.js";

/** Normalised 0-1000 box, Gemini's box_2d convention. */
export interface Box {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export interface CloseupFeature {
  feature_type: FeatureType;
  label: string;
  caption: string;
  box: Box;
}

export interface GarmentAnalysis {
  source: "gemini" | "preset";
  /** Exactly two close-up subjects, of different feature types, most distinctive first. */
  closeups: [CloseupFeature, CloseupFeature];
  cuff: Box | null;
}

function presetFor(type: string): Omit<GarmentAnalysis, "source"> {
  const c = canonicalGarment(type);
  if (c === "trousers" || c === "skirt") {
    return {
      closeups: [
        { feature_type: "construction", label: "waistband and closure", caption: "Detail · Waistband & closure", box: { ymin: 30, xmin: 250, ymax: 320, xmax: 750 } },
        { feature_type: "texture", label: "fabric", caption: "Macro · Fabric", box: { ymin: 380, xmin: 280, ymax: 600, xmax: 500 } },
      ],
      cuff: null,
    };
  }
  return {
    closeups: [
      { feature_type: "construction", label: "neckline and closure", caption: "Detail · Neckline & closure", box: { ymin: 90, xmin: 310, ymax: 460, xmax: 690 } },
      { feature_type: "texture", label: "fabric", caption: "Macro · Fabric", box: { ymin: 480, xmin: 240, ymax: 700, xmax: 460 } },
    ],
    cuff: null,
  };
}

function toBox(arr: unknown): Box | null {
  if (!Array.isArray(arr) || arr.length !== 4 || !arr.every((n) => typeof n === "number")) return null;
  const [ymin, xmin, ymax, xmax] = arr.map((n) => Math.max(0, Math.min(1000, n)));
  return ymax - ymin >= 20 && xmax - xmin >= 20 ? { ymin, xmin, ymax, xmax } : null;
}

const boxSchema = { type: "ARRAY", items: { type: "INTEGER" } };
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    standout_features: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          feature_type: { type: "STRING", enum: FEATURE_TYPES },
          label: { type: "STRING" },
          caption: { type: "STRING" },
          distinctiveness: { type: "INTEGER" },
          box_2d: boxSchema,
        },
        required: ["feature_type", "label", "caption", "distinctiveness", "box_2d"],
      },
    },
    cuff_box_2d: boxSchema,
  },
  required: ["standout_features"],
};

/**
 * Asks Gemini for the garment's standout features and picks the two most distinctive of different
 * types as close-up subjects. Missing picks are filled from per-family presets.
 */
export async function analyzeGarment(frontFlat: Buffer, garmentType: string): Promise<GarmentAnalysis> {
  const preset = presetFor(garmentType);
  if (!env.GEMINI_API_KEY) return { source: "preset", ...preset };

  try {
    const { data } = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`,
      {
        contents: [{
          parts: [
            { inline_data: { mime_type: "image/jpeg", data: frontFlat.toString("base64") } },
            { text: garmentAnalysisPrompt(garmentType) },
          ],
        }],
        generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
      },
      { headers: { "x-goog-api-key": env.GEMINI_API_KEY, "Content-Type": "application/json" }, timeout: 60_000 },
    );
    const parsed = JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}") as {
      standout_features?: Array<{ feature_type?: FeatureType; label?: string; caption?: string; distinctiveness?: number; box_2d?: unknown }>;
      cuff_box_2d?: unknown;
    };

    const picks: CloseupFeature[] = [];
    const ranked = [...(parsed.standout_features ?? [])].sort((a, b) => (b.distinctiveness ?? 0) - (a.distinctiveness ?? 0));
    for (const f of ranked) {
      const box = toBox(f.box_2d);
      if (picks.length === 2 || !box || !f.feature_type || !FEATURE_TYPES.includes(f.feature_type)) continue;
      if (picks.some((p) => p.feature_type === f.feature_type)) continue;
      picks.push({ feature_type: f.feature_type, label: f.label ?? f.feature_type, caption: f.caption ?? `Detail · ${f.label}`, box });
    }
    for (const p of preset.closeups) {
      if (picks.length < 2 && !picks.some((x) => x.feature_type === p.feature_type)) picks.push(p);
    }
    return { source: "gemini", closeups: [picks[0], picks[1]], cuff: toBox(parsed.cuff_box_2d) };
  } catch (err) {
    console.warn(`Garment analysis failed, using presets for ${garmentType}: ${describeError(err)}`);
    return { source: "preset", ...preset };
  }
}

/** Crops a box from the image as a square and upscales it to 1024px. */
export async function cropRegion(image: Buffer, box: Box): Promise<Buffer> {
  const { width = 1024, height = 1024 } = await sharp(image).metadata();
  const short = Math.min(width, height);
  const cx = ((box.xmin + box.xmax) / 2 / 1000) * width;
  const cy = ((box.ymin + box.ymax) / 2 / 1000) * height;
  const raw = Math.max(((box.xmax - box.xmin) / 1000) * width, ((box.ymax - box.ymin) / 1000) * height);
  const side = Math.round(Math.min(Math.max(raw, short * 0.28), short * 0.6));
  const left = Math.round(Math.min(Math.max(cx - side / 2, 0), width - side));
  const top = Math.round(Math.min(Math.max(cy - side / 2, 0), height - side));
  return sharp(image)
    .extract({ left, top, width: side, height: side })
    .resize(1024, 1024, { kernel: "lanczos3" })
    .jpeg({ quality: 95 })
    .toBuffer();
}
