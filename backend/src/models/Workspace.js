import mongoose from "mongoose";

const elementSchema = new mongoose.Schema(
  {
    element_id:   { type: String, required: true },
    look_id:      { type: String, required: true },
    garment_id:   { type: String, required: true },
    garment_type: { type: String, required: true },
    element_type: { type: String, enum: ["color", "fabric", "pattern", "silhouette"], required: true },
    data:         { type: mongoose.Schema.Types.Mixed },
    source_brand: { type: String },
    canvas_position: {
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 },
    },
    row: { type: String },
  },
  { _id: false }
);

const workspaceSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    project_id:  { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    user_id:     { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status:      { type: String, enum: ["draft", "ready", "generating"], default: "draft" },
    elements:    [elementSchema],
    canvas_meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export default mongoose.model("Workspace", workspaceSchema);
