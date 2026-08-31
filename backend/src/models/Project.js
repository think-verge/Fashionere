import mongoose from "mongoose";

const projectSchema = new mongoose.Schema(
  {
    name:       { type: String, required: true, trim: true },
    user_id:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    is_default: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export default mongoose.model("Project", projectSchema);
