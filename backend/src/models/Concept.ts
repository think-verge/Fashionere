import mongoose, { type Document, Schema, type Types } from "mongoose";
import type { ICoherence } from "./GenerationJob.js";

export interface IConcept extends Document {
  workspace_id: Types.ObjectId;
  job_id: Types.ObjectId;
  combo: {
    silhouette_id: string;
    silhouette_label: string;
    silhouette_brand: string;
    silhouette_garment_type: string;
    fabric_id: string;
    fabric_label: string;
    fabric_family: string;
    fabric_brand: string;
    pattern_id?: string | null;
    pattern_label?: string | null;
    pattern_brand?: string | null;
    color: { hex: string; name: string };
  };
  image: {
    gridfs_id?: Types.ObjectId;
    width?: number;
    height?: number;
    format?: string;
  };
  generation: {
    model: string;
    prompt: string;
    fal_request_id?: string;
    inference_time_s?: number;
    cost_usd?: number;
  };
  coherence: ICoherence;
  status: "pending" | "generating" | "generated" | "failed" | "approved" | "rejected";
  createdAt: Date;
  updatedAt: Date;
}

const conceptSchema = new Schema<IConcept>(
  {
    workspace_id: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    job_id: { type: Schema.Types.ObjectId, ref: "GenerationJob", required: true, index: true },
    combo: {
      silhouette_id: { type: String, required: true },
      silhouette_label: { type: String, required: true },
      silhouette_brand: { type: String, required: true },
      silhouette_garment_type: { type: String, required: true },
      fabric_id: { type: String, required: true },
      fabric_label: { type: String, required: true },
      fabric_family: { type: String, required: true },
      fabric_brand: { type: String, required: true },
      pattern_id: { type: String, default: null },
      pattern_label: { type: String, default: null },
      pattern_brand: { type: String, default: null },
      color: {
        hex: { type: String, required: true },
        name: { type: String, required: true },
      },
    },
    image: {
      gridfs_id: { type: Schema.Types.ObjectId },
      width: { type: Number },
      height: { type: Number },
      format: { type: String },
    },
    generation: {
      model: { type: String, default: "" },
      prompt: { type: String, default: "" },
      fal_request_id: { type: String },
      inference_time_s: { type: Number },
      cost_usd: { type: Number },
    },
    coherence: {
      score: { type: Number, required: true },
      verdict: { type: String, enum: ["pass", "stretch", "kill"], required: true },
      rationale: { type: String, required: true },
      rule_source: { type: String, enum: ["rules", "llm"], required: true },
      factors: [{ type: String }],
      overridden: { type: Boolean, default: false },
      overridden_by: { type: Schema.Types.ObjectId, ref: "User" },
    },
    status: {
      type: String,
      enum: ["pending", "generating", "generated", "failed", "approved", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true },
);

export const Concept = mongoose.model<IConcept>("Concept", conceptSchema);
