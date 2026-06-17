import mongoose, { type Document, Schema, type Types } from "mongoose";

export type MoodboardStatus = "pending" | "running" | "done" | "error";
export type InputMode = "query" | "catalogue" | "image";

export interface IMoodboard extends Document {
  userId: Types.ObjectId;
  jobId: string;
  status: MoodboardStatus;
  inputMode: InputMode;
  inputPayload: Record<string, unknown>;
  moodboard: Record<string, unknown> | null;
  name: string;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const moodboardSchema = new Schema<IMoodboard>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    jobId: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "running", "done", "error"],
      default: "pending",
    },
    inputMode: {
      type: String,
      enum: ["query", "catalogue", "image"],
      required: true,
    },
    inputPayload: { type: Schema.Types.Mixed, default: {} },
    moodboard: { type: Schema.Types.Mixed, default: null },
    name: { type: String, default: "" },
    error: { type: String, default: null },
  },
  { timestamps: true },
);

export const Moodboard = mongoose.model<IMoodboard>("Moodboard", moodboardSchema);
