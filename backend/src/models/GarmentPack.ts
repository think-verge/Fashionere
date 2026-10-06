import mongoose, { type Document, Schema, type Types } from "mongoose";

export type ShotSlot = "flat_lay" | "back_flat" | "closeup_1" | "closeup_2";
export type FeatureType = "pattern" | "texture" | "hardware" | "trim" | "construction" | "shape";
export type ShotStatus = "pending" | "generating" | "generated" | "failed";
export type PackStatus = "generating" | "ready" | "partial" | "failed";

export interface IRegion {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

/** One rendered version of a slot. Regenerating appends a new version; is_current marks the one shown. */
export interface IGarmentShot {
  _id: Types.ObjectId;
  slot: ShotSlot;
  version: number;
  is_current: boolean;
  /** Close-ups only: what the shot zooms on, as chosen from the garment's standout features. */
  focus?: string | null;
  feature_type?: FeatureType | null;
  caption?: string | null;
  region?: IRegion | null;
  status: ShotStatus;
  image?: { gridfs_id?: Types.ObjectId; width?: number; height?: number };
  generation?: {
    model?: string;
    prompt?: string;
    fal_request_id?: string;
    inference_time_s?: number;
    cost_usd?: number;
  };
  error?: string | null;
  createdAt?: Date;
}

export interface IGarmentPack extends Document {
  workspace_id: Types.ObjectId;
  user_id: Types.ObjectId;
  concept_id: Types.ObjectId;
  root_concept_id: Types.ObjectId;
  status: PackStatus;
  inputs: {
    front_gridfs_id: Types.ObjectId;
    garment_type: string;
    regions_source?: "gemini" | "preset" | null;
    cuff_region?: IRegion | null;
  };
  shots: Types.DocumentArray<IGarmentShot & mongoose.Types.Subdocument>;
  total_cost_usd: number;
  createdAt: Date;
  updatedAt: Date;
}

const regionSchema = new Schema<IRegion>(
  { ymin: Number, xmin: Number, ymax: Number, xmax: Number },
  { _id: false },
);

const shotSchema = new Schema<IGarmentShot>(
  {
    slot: { type: String, enum: ["flat_lay", "back_flat", "closeup_1", "closeup_2"], required: true },
    version: { type: Number, required: true },
    is_current: { type: Boolean, default: true },
    focus: { type: String, default: null },
    feature_type: { type: String, enum: ["pattern", "texture", "hardware", "trim", "construction", "shape", null], default: null },
    caption: { type: String, default: null },
    region: { type: regionSchema, default: null },
    status: { type: String, enum: ["pending", "generating", "generated", "failed"], default: "pending" },
    image: {
      gridfs_id: { type: Schema.Types.ObjectId },
      width: Number,
      height: Number,
    },
    generation: {
      model: String,
      prompt: String,
      fal_request_id: String,
      inference_time_s: Number,
      cost_usd: Number,
    },
    error: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const garmentPackSchema = new Schema<IGarmentPack>(
  {
    workspace_id: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    concept_id: { type: Schema.Types.ObjectId, ref: "Concept", required: true, unique: true },
    root_concept_id: { type: Schema.Types.ObjectId, ref: "Concept", required: true },
    status: { type: String, enum: ["generating", "ready", "partial", "failed"], default: "generating" },
    inputs: {
      front_gridfs_id: { type: Schema.Types.ObjectId, required: true },
      garment_type: { type: String, required: true },
      regions_source: { type: String, enum: ["gemini", "preset", null], default: null },
      cuff_region: { type: regionSchema, default: null },
    },
    shots: [shotSchema],
    total_cost_usd: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const GarmentPack = mongoose.model<IGarmentPack>("GarmentPack", garmentPackSchema);
