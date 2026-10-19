import mongoose, { type Document, Schema, type Types } from "mongoose";

export interface ITenant extends Document {
  name: string;
  slug: string;
  owner_id: Types.ObjectId;
  plan: "standard" | "enterprise";
  status: "active" | "suspended";
  shopify_connected: boolean;
  shopify_shop_domain?: string | null;
  shared_with_tenants: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const tenantSchema = new Schema<ITenant>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    owner_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    plan: { type: String, enum: ["standard", "enterprise"], default: "standard" },
    status: { type: String, enum: ["active", "suspended"], default: "active" },
    shopify_connected: { type: Boolean, default: false },
    shopify_shop_domain: { type: String, default: null },
    shared_with_tenants: [{ type: Schema.Types.ObjectId, ref: "Tenant" }],
  },
  { timestamps: true },
);

export const Tenant = mongoose.model<ITenant>("Tenant", tenantSchema);
