import mongoose, { type Document, Schema, type Types } from "mongoose";

export interface IBrandRequest extends Document {
  tenant_id: Types.ObjectId;
  requested_by: Types.ObjectId;
  brand_name: string;
  source_type: "runway" | "retail";
  season?: string;
  reference_url?: string;
  notes?: string;
  status: "pending" | "approved" | "deconstructing" | "completed" | "rejected";
  rejection_reason?: string;
  admin_notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const brandRequestSchema = new Schema<IBrandRequest>(
  {
    tenant_id: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    requested_by: { type: Schema.Types.ObjectId, ref: "User", required: true },
    brand_name: { type: String, required: true, trim: true },
    source_type: { type: String, enum: ["runway", "retail"], required: true },
    season: { type: String, trim: true },
    reference_url: { type: String, trim: true },
    notes: { type: String, trim: true },
    status: {
      type: String,
      enum: ["pending", "approved", "deconstructing", "completed", "rejected"],
      default: "pending",
      index: true,
    },
    rejection_reason: { type: String, trim: true },
    admin_notes: { type: String, trim: true },
  },
  { timestamps: true }
);

brandRequestSchema.index({ tenant_id: 1, status: 1 });
brandRequestSchema.index({ brand_name: 1, source_type: 1 });

export const BrandRequest = mongoose.model<IBrandRequest>("BrandRequest", brandRequestSchema);
