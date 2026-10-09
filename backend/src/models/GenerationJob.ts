import mongoose, { type Document, Schema, type Types } from "mongoose";

export interface ICoherence {
  score: number;
  verdict: "pass" | "stretch" | "kill";
  rationale: string;
  rule_source: "rules" | "llm";
  factors: string[];
  overridden?: boolean;
  overridden_by?: Types.ObjectId;
}

export interface IComboRef {
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
}

export interface IDiscardedCombo extends IComboRef {
  coherence: ICoherence;
}

export interface IPassedCombo {
  concept_id: Types.ObjectId;
  coherence_score: number;
}

export interface IGenerationJob extends Document {
  workspace_id: Types.ObjectId;
  user_id: Types.ObjectId;
  mode: "manual" | "suggest";
  combos_total: number;
  combos_completed: number;
  combos_killed: number;
  combos_matrix_size: number;
  estimated_cost_usd: number;
  total_cost_usd: number;
  combos: IPassedCombo[];
  discarded_combos: IDiscardedCombo[];
  status: "queued" | "running" | "completed" | "partial_failure";
  started_at?: Date;
  completed_at?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const coherenceSchema = new Schema<ICoherence>(
  {
    score: { type: Number, required: true },
    verdict: { type: String, enum: ["pass", "stretch", "kill"], required: true },
    rationale: { type: String, required: true },
    rule_source: { type: String, enum: ["rules", "llm"], required: true },
    factors: [{ type: String }],
    overridden: { type: Boolean, default: false },
    overridden_by: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { _id: false },
);

const comboRefSchema = new Schema<IComboRef>(
  {
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
  { _id: false },
);

const discardedComboSchema = new Schema<IDiscardedCombo>(
  {
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
    coherence: { type: coherenceSchema, required: true },
  },
  { _id: false },
);

const passedComboSchema = new Schema<IPassedCombo>(
  {
    concept_id: { type: Schema.Types.ObjectId, ref: "Concept", required: true },
    coherence_score: { type: Number, required: true },
  },
  { _id: false },
);

const generationJobSchema = new Schema<IGenerationJob>(
  {
    workspace_id: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    mode: { type: String, enum: ["manual", "suggest"], required: true },
    combos_total: { type: Number, default: 0 },
    combos_completed: { type: Number, default: 0 },
    combos_killed: { type: Number, default: 0 },
    combos_matrix_size: { type: Number, default: 0 },
    estimated_cost_usd: { type: Number, default: 0 },
    total_cost_usd: { type: Number, default: 0 },
    combos: [passedComboSchema],
    discarded_combos: [discardedComboSchema],
    status: { type: String, enum: ["queued", "running", "completed", "partial_failure"], default: "queued" },
    started_at: { type: Date },
    completed_at: { type: Date },
  },
  { timestamps: true },
);

export const GenerationJob = mongoose.model<IGenerationJob>("GenerationJob", generationJobSchema);
