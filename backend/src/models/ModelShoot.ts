import mongoose, { type Document, Schema, type Types } from "mongoose";

export type ShootStatus = "generating" | "ready" | "failed";
export type ShootImageKind = "main" | "shot";
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

/** The look's magazine copy, written from the approved main image. */
export interface IEditorialCopy {
  look_name: string;
  title: string;
  statement: string[];
  pull_quote: string;
  /** Credits, read from the photograph. */
  fabric: string;
  palette: string;
  generated_at: Date;
}

/**
 * One image of the shoot. "main" images are versions of the hero shot (is_current marks the one shown);
 * "shot" images are the art-directed editorial shots, generated in batches from the approved main image.
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
    kind: { type: String, enum: ["main", "shot"], required: true },
    version: Number,
    is_current: Boolean,
    batch: Number,
    instruction: { type: String, default: null },
    based_on: { type: Schema.Types.ObjectId, default: null },
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
    editorial: {
      type: new Schema<IEditorialCopy>(
        { look_name: String, title: String, statement: [String], pull_quote: String, fabric: String, palette: String, generated_at: Date },
        { _id: false },
      ),
      default: null,
    },
    total_cost_usd: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const ModelShoot = mongoose.model<IModelShoot>("ModelShoot", modelShootSchema);
