import mongoose, { type Document, Schema, type Types } from "mongoose";

export interface IWorkspaceElement {
  element_id: string;
  look_id?: string;
  garment_id?: string;
  garment_type: string;
  element_type: "color" | "fabric" | "pattern" | "silhouette" | "shot";
  data: Record<string, unknown>;
  source_brand: string;
  canvas_position: { x: number; y: number };
  row: string;
  canvas_row?: number | null;
  is_custom?: boolean;
  /** Moodboard folder this element is filed in. */
  folder_id?: string | null;
  /**
   * Whether the element has been moved to the AI builder. Legacy elements
   * (field absent) count as in the builder; see `isInBuilder`.
   */
  in_builder?: boolean;
  added_at?: Date;
}

/** A look added to the workspace moodboard, filed under a dated folder. */
export interface IWorkspaceLook {
  look_id: string;
  date_folder_id: string;
  added_at: Date;
  thumbnail?: string | null;
  brand?: string;
  title?: string;
}

export interface IWorkspace extends Document {
  name: string;
  project_id: Types.ObjectId;
  user_id: Types.ObjectId;
  status: "draft" | "ready" | "generating";
  elements: IWorkspaceElement[];
  looks: IWorkspaceLook[];
  schema_version?: number;
  canvas_meta: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const elementSchema = new Schema<IWorkspaceElement>(
  {
    element_id: { type: String, required: true },
    look_id: { type: String, default: "" },
    garment_id: { type: String, default: "" },
    garment_type: { type: String, required: true },
    element_type: { type: String, enum: ["color", "fabric", "pattern", "silhouette", "shot"], required: true },
    data: { type: Schema.Types.Mixed, default: {} },
    source_brand: { type: String, default: "" },
    canvas_position: { x: { type: Number, default: 0 }, y: { type: Number, default: 0 } },
    row: { type: String, default: "" },
    canvas_row: { type: Number, default: null },
    is_custom: { type: Boolean, default: false },
    folder_id: { type: String, default: null },
    in_builder: { type: Boolean },
    added_at: { type: Date },
  },
  { _id: false },
);

const workspaceLookSchema = new Schema<IWorkspaceLook>(
  {
    look_id: { type: String, required: true },
    date_folder_id: { type: String, required: true },
    added_at: { type: Date, default: () => new Date() },
    thumbnail: { type: String, default: null },
    brand: { type: String, default: "" },
    title: { type: String, default: "" },
  },
  { _id: false },
);

const workspaceSchema = new Schema<IWorkspace>(
  {
    name: { type: String, required: true, trim: true },
    project_id: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["draft", "ready", "generating"], default: "draft" },
    elements: [elementSchema],
    looks: { type: [workspaceLookSchema], default: [] },
    schema_version: { type: Number, default: 1 },
    canvas_meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

export const Workspace = mongoose.model<IWorkspace>("Workspace", workspaceSchema);
