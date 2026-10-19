import mongoose, { type Document, Schema, type Types } from "mongoose";

export interface ITenantInvite extends Document {
  token: string;
  email: string;
  tenant_id: Types.ObjectId;
  tenant_name: string;
  invited_by: Types.ObjectId;
  status: "pending" | "accepted" | "revoked" | "expired";
  expires_at: Date;
  accepted_at?: Date | null;
  accepted_by?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const tenantInviteSchema = new Schema<ITenantInvite>(
  {
    token: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    tenant_id: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    tenant_name: { type: String, required: true, trim: true },
    invited_by: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "revoked", "expired"],
      default: "pending",
      index: true,
    },
    expires_at: { type: Date, required: true },
    accepted_at: { type: Date, default: null },
    accepted_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

tenantInviteSchema.index({ email: 1, status: 1 });

export const TenantInvite = mongoose.model<ITenantInvite>("TenantInvite", tenantInviteSchema);
