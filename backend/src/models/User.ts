import mongoose, { type Document, Schema } from "mongoose";

export interface IUser extends Document {
  email: string;
  password: string;
  name: string;
  role: "designer" | "retail_chain";
  sources: string[];
  garment_interests: string[];
  onboarding_complete: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ["designer", "retail_chain"], default: "designer" },
    sources: [{ type: String }],
    garment_interests: [{ type: String }],
    onboarding_complete: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const User = mongoose.model<IUser>("User", userSchema);
