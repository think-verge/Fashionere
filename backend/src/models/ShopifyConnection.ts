import mongoose, { type Document, Schema, type Types } from "mongoose";

export interface IShopifyConnection extends Document {
  tenant_id: Types.ObjectId;
  shop_domain: string;
  access_token: string;
  scopes: string[];
  status: "active" | "disconnected" | "syncing" | "error";
  last_synced_at?: Date | null;
  sync_error?: string | null;
  product_count?: number;
  created_at: Date;
  updated_at: Date;
}

const shopifyConnectionSchema = new Schema<IShopifyConnection>(
  {
    tenant_id: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      unique: true,
      index: true,
    },
    shop_domain: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    access_token: {
      type: String,
      required: true,
    },
    scopes: [{ type: String }],
    status: {
      type: String,
      enum: ["active", "disconnected", "syncing", "error"],
      default: "active",
      index: true,
    },
    last_synced_at: {
      type: Date,
      default: null,
    },
    sync_error: {
      type: String,
      default: null,
    },
    product_count: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export const ShopifyConnection = mongoose.model<IShopifyConnection>(
  "ShopifyConnection",
  shopifyConnectionSchema
);
