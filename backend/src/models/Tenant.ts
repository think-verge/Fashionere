import mongoose, { type Document, Schema, type Types } from "mongoose";

export interface ITenant extends Document {
  name: string;
  slug: string;
  owner_id: Types.ObjectId;
  plan: "standard" | "enterprise";
  status: "active" | "suspended";
  shopify_connected: boolean;
  shopify_shop_domain?: string | null;
  shopify_access_token?: string | null;
  shopify_scopes?: string[];
  shopify_connected_at?: Date | null;
  shopify_catalog_synced_at?: Date | null;
  shopify_sync_status?: "idle" | "syncing" | "synced" | "failed";
  shopify_sync_error?: string | null;
  shopify_product_count?: number;
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
    shopify_access_token: { type: String, default: null },
    shopify_scopes: [{ type: String }],
    shopify_connected_at: { type: Date, default: null },
    shopify_catalog_synced_at: { type: Date, default: null },
    shopify_sync_status: {
      type: String,
      enum: ["idle", "syncing", "synced", "failed"],
      default: "idle",
    },
    shopify_sync_error: { type: String, default: null },
    shopify_product_count: { type: Number, default: 0 },
    shared_with_tenants: [{ type: Schema.Types.ObjectId, ref: "Tenant" }],
  },
  { timestamps: true },
);

export const Tenant = mongoose.model<ITenant>("Tenant", tenantSchema);
