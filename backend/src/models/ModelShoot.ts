import mongoose, { type Document, Schema, type Types } from "mongoose";

export type ShootStatus = "generating" | "ready" | "failed";
export type ShootImageKind = "main" | "shot" | "detail";
export type ShootImageStatus = "pending" | "generating" | "generated" | "failed";
export type ShotView = "front" | "three_quarter" | "side" | "back" | "close_detail";

export interface IModelConfig {
  gender: string;
  size: string;
  height: string;
  skin_tone: string;
  age: string;
  hair: string;
}

/** The rest of the look around the hero garment. Suggested by the stylist, editable by the designer. */
export interface IOutfit {
  top: string;
  bottoms: string;
  shoes: string;
  accessories: string;
}

/** Read once from the garment's front flat: its colours and fixed construction (the design guardrails). */
export interface IGarmentRead {
  version?: number;
  dominant_colour: string;
  accent_colours: string;
  design: Record<string, string>;
}

/** A captioned image in the editorial; points at an image of the shoot (a shot, or a detail crop of the flat). */
export interface IEditorialFigure {
  image_id: Types.ObjectId;
  caption: string;
}

/**
 * The garment's magazine feature: written by a writer agent, then rewritten by an editor agent to the house
 * style (third person, flowing prose, no lists). Version 2; version 1 copies (a first-person "statement") are
 * treated as not written.
 */
export interface IEditorialCopy {
  version: number;
  look_name: string;
  headline: string;
  standfirst: string;
  hero_caption: string;
  opening: string[];
  pull_quote: string;
  details: IEditorialFigure[];
  closing: string[];
  shots: IEditorialFigure[];
  credit_line: string;
  fabric: string;
  palette: string;
  generated_at: Date;
}

/**
 * One image of the shoot. "main" images are versions of the hero shot (is_current marks the one shown);
 * "shot" images are the art-directed editorial shots, generated in batches from the approved main image;
 * "detail" images are crops of the front flat used by the editorial.
 */
export interface IShootImage {
  _id: Types.ObjectId;
  kind: ShootImageKind;
  version?: number;
  is_current?: boolean;
  batch?: number;
  /** Main: the edit the designer asked for, and the version it was applied to. */
  instruction?: string | null;
  based_on?: Types.ObjectId | null;
  /**
   * Main: the image whose model this version must show (same face and body). Null when the model is cast fresh —
   * the first image of a shoot, or after the designer changes gender, age or skin tone.
   */
  identity_ref?: { shoot_id: Types.ObjectId; image_id: Types.ObjectId } | null;
  /**
   * Main: the photograph this version re-dresses — usually the approved image of another variation's shoot, for
   * Compare variations. Only the garment is swapped; model, pose, outfit, framing and light stay as they are.
   */
  swap_from?: { shoot_id: Types.ObjectId; image_id: Types.ObjectId } | null;
  /** Main: a cached close-up of the model's face, the identity reference passed to later generations. */
  face?: { gridfs_id?: Types.ObjectId } | null;
  /** Shot: the art director's idea. */
  title?: string | null;
  view?: ShotView | null;
  framing?: string | null;
  pose?: string | null;
  camera?: string | null;
  model_config?: IModelConfig;
  outfit?: IOutfit;
  status: ShootImageStatus;
  image?: { gridfs_id?: Types.ObjectId; width?: number; height?: number };
  generation?: { model?: string; prompt?: string; fal_request_id?: string; cost_usd?: number };
  error?: string | null;
  createdAt?: Date;
}

export interface IModelShoot extends Document {
  workspace_id: Types.ObjectId;
  user_id: Types.ObjectId;
  concept_id: Types.ObjectId;
  garment_type: string;
  model_config: IModelConfig;
  outfit: IOutfit | null;
  garment_read: IGarmentRead | null;
  status: ShootStatus;
  approved_main_id: Types.ObjectId | null;
  images: Types.DocumentArray<IShootImage & mongoose.Types.Subdocument>;
  editorial: IEditorialCopy | null;
  total_cost_usd: number;
  createdAt: Date;
  updatedAt: Date;
}

const modelConfigSchema = new Schema<IModelConfig>(
  { gender: String, size: String, height: String, skin_tone: String, age: String, hair: String },
  { _id: false },
);

const outfitSchema = new Schema<IOutfit>({ top: String, bottoms: String, shoes: String, accessories: String }, { _id: false });

const imageSchema = new Schema<IShootImage>(
  {
    kind: { type: String, enum: ["main", "shot", "detail"], required: true },
    version: Number,
    is_current: Boolean,
    batch: Number,
    instruction: { type: String, default: null },
    based_on: { type: Schema.Types.ObjectId, default: null },
    identity_ref: {
      type: new Schema({ shoot_id: Schema.Types.ObjectId, image_id: Schema.Types.ObjectId }, { _id: false }),
      default: null,
    },
    swap_from: {
      type: new Schema({ shoot_id: Schema.Types.ObjectId, image_id: Schema.Types.ObjectId }, { _id: false }),
      default: null,
    },
    face: { type: new Schema({ gridfs_id: Schema.Types.ObjectId }, { _id: false }), default: null },
    title: { type: String, default: null },
    view: { type: String, enum: ["front", "three_quarter", "side", "back", "close_detail", null], default: null },
    framing: { type: String, default: null },
    pose: { type: String, default: null },
    camera: { type: String, default: null },
    model_config: { type: modelConfigSchema },
    outfit: { type: outfitSchema },
    status: { type: String, enum: ["pending", "generating", "generated", "failed"], default: "pending" },
    image: { gridfs_id: { type: Schema.Types.ObjectId }, width: Number, height: Number },
    generation: { model: String, prompt: String, fal_request_id: String, cost_usd: Number },
    error: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const modelShootSchema = new Schema<IModelShoot>(
  {
    workspace_id: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    concept_id: { type: Schema.Types.ObjectId, ref: "Concept", required: true, unique: true },
    garment_type: { type: String, required: true },
    model_config: { type: modelConfigSchema, required: true },
    outfit: { type: outfitSchema, default: null },
    garment_read: {
      type: new Schema<IGarmentRead>(
        { version: Number, dominant_colour: String, accent_colours: String, design: { type: Schema.Types.Mixed } },
        { _id: false },
      ),
      default: null,
    },
    status: { type: String, enum: ["generating", "ready", "failed"], default: "generating" },
    approved_main_id: { type: Schema.Types.ObjectId, default: null },
    images: [imageSchema],
    // Mixed: older shoots hold a version-1 copy of a different shape; the service only reads version 2.
    editorial: { type: Schema.Types.Mixed, default: null },
    total_cost_usd: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const ModelShoot = mongoose.model<IModelShoot>("ModelShoot", modelShootSchema);
