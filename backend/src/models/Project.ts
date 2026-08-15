import mongoose, { type Document, Schema, type Types } from "mongoose";

export interface IProject extends Document {
  userId: Types.ObjectId;
  name: string;
  description: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const projectSchema = new Schema<IProject>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    tags: [{ type: String }],
  },
  { timestamps: true },
);

export const Project = mongoose.model<IProject>("Project", projectSchema);
