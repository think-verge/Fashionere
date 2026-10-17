import mongoose, { type Document, Schema, type Types } from "mongoose";

export const CHILD_KINDS = ["shots", "silhouettes", "palettes", "fabrics", "patterns"] as const;
export type ChildKind = (typeof CHILD_KINDS)[number];
export type FolderKind = "looks_root" | "date" | "custom" | ChildKind;

export interface IFolder extends Document {
  workspace_id: Types.ObjectId;
  user_id: Types.ObjectId;
  parent_id: Types.ObjectId | null;
  name: string;
  kind: FolderKind;
  /** System folders (the Looks root and the five element folders) can't be renamed or deleted. */
  system: boolean;
  /** YYYY-MM-DD for date folders. */
  date?: string;
  createdAt: Date;
  updatedAt: Date;
}

const folderSchema = new Schema<IFolder>(
  {
    workspace_id: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    parent_id: { type: Schema.Types.ObjectId, ref: "Folder", default: null },
    name: { type: String, required: true, trim: true },
    kind: {
      type: String,
      enum: ["looks_root", "date", "custom", ...CHILD_KINDS],
      required: true,
    },
    system: { type: Boolean, default: false },
    date: { type: String },
  },
  { timestamps: true },
);

folderSchema.index({ workspace_id: 1, parent_id: 1 });

export const Folder = mongoose.model<IFolder>("Folder", folderSchema);
