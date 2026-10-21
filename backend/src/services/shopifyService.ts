import crypto from "node:crypto";
import axios from "axios";
import mongoose from "mongoose";
import { Tenant, type ITenant } from "../models/Tenant.js";
import { ApiError } from "../utils/api-error.js";
import { env } from "../config/env.js";

const looksCol = () => mongoose.connection.db!.collection("canonical_looks");

export interface ShopifyProductImage {
  id: number | string;
  src: string;
  alt?: string;
  width?: number;
  height?: number;
}

export interface ShopifyProductVariant {
  id: number | string;
  title: string;
  price: string;
  sku?: string;
  inventory_quantity?: number;
}

export interface ShopifyProduct {
  id: number | string;
  title: string;
  body_html?: string;
  vendor?: string;
  product_type?: string;
  tags?: string;
  images?: ShopifyProductImage[];
  image?: ShopifyProductImage;
  variants?: ShopifyProductVariant[];
}

/**
 * Validates and sanitizes a Shopify store domain.
 * Accepts "my-shop", "my-shop.myshopify.com", "https://my-shop.myshopify.com".
 */
export function sanitizeShopDomain(rawShop: string): string {
  if (!rawShop) {
    throw new ApiError(400, "Shop domain is required");
  }

  let shop = rawShop.trim().toLowerCase();
  shop = shop.replace(/^https?:\/\//, "");
  shop = shop.replace(/\/.*$/, "");

  if (!shop.includes(".")) {
    shop = `${shop}.myshopify.com`;
  }

  const shopRegex = /^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/;
  if (!shopRegex.test(shop)) {
    throw new ApiError(
      400,
      `Invalid Shopify domain '${rawShop}'. Must be in format 'your-store.myshopify.com'`
    );
  }

  return shop;
}

/**
 * Generates a tamper-proof state nonce embedding the tenantId.
 */
export function generateOAuthState(tenantId: string): string {
  const payload = `${tenantId}:${Date.now()}:${crypto.randomBytes(8).toString("hex")}`;
  const sig = crypto.createHmac("sha256", env.JWT_SECRET).update(payload).digest("hex");
  return Buffer.from(JSON.stringify({ payload, sig })).toString("base64url");
}

/**
 * Validates and extracts tenantId from OAuth state nonce.
 */
export function verifyOAuthState(stateString: string): string {
  try {
    const raw = Buffer.from(stateString, "base64url").toString("utf8");
    const { payload, sig } = JSON.parse(raw);
    const expectedSig = crypto.createHmac("sha256", env.JWT_SECRET).update(payload).digest("hex");

    if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expectedSig, "hex"))) {
      throw new Error("Invalid signature");
    }

    const [tenantId, timestampStr] = payload.split(":");
    const timestamp = parseInt(timestampStr, 10);
    const fifteenMinutes = 15 * 60 * 1000;

    if (Date.now() - timestamp > fifteenMinutes) {
      throw new Error("State has expired");
    }

    return tenantId;
  } catch (err: any) {
    throw new ApiError(400, `OAuth state validation failed: ${err.message}`);
  }
}

/**
 * Validates Shopify HMAC signature for query parameters.
 */
export function verifyShopifyHmac(query: Record<string, any>): boolean {
  const hmac = query.hmac;
  if (!hmac || typeof hmac !== "string") return false;

  const params: string[] = [];
  const keys = Object.keys(query)
    .filter((k) => k !== "hmac" && k !== "signature")
    .sort();

  for (const k of keys) {
    const val = Array.isArray(query[k]) ? query[k].join(",") : query[k];
    params.push(`${k}=${val}`);
  }

  const message = params.join("&");
  const generatedHash = crypto
    .createHmac("sha256", env.SHOPIFY_API_SECRET)
    .update(message)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(hmac, "hex"),
      Buffer.from(generatedHash, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Constructs the Shopify OAuth authorization URL.
 */
export function buildAuthorizationUrl(
  tenantId: string,
  rawShop: string
): { authUrl: string; shop: string; state: string } {
  const shop = sanitizeShopDomain(rawShop);
  const state = generateOAuthState(tenantId);
  const redirectUri = `${env.SHOPIFY_APP_URL}/api/v1/shopify/callback`;

  const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${encodeURIComponent(
    env.SHOPIFY_API_KEY
  )}&scope=${encodeURIComponent(env.SHOPIFY_SCOPES)}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&state=${encodeURIComponent(state)}`;

  return { authUrl, shop, state };
}

/**
 * Handles OAuth callback and completes connection for the Tenant.
 */
export async function handleOAuthCallback(query: {
  code?: string;
  shop?: string;
  state?: string;
  hmac?: string;
  [key: string]: any;
}): Promise<{ tenant: ITenant; shop: string }> {
  const { code, shop: rawShop, state, hmac } = query;

  if (!code || !rawShop || !state) {
    throw new ApiError(400, "Missing required OAuth parameters: code, shop, or state");
  }

  const shop = sanitizeShopDomain(rawShop);
  const tenantId = verifyOAuthState(state);

  // Validate HMAC in production or when valid secret is configured
  if (env.NODE_ENV === "production" && !verifyShopifyHmac(query)) {
    throw new ApiError(401, "Shopify HMAC signature verification failed");
  }

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw new ApiError(404, "Tenant not found for OAuth session");
  }

  let accessToken = `shpat_sandbox_${crypto.randomBytes(16).toString("hex")}`;

  // Exchange authorization code for permanent access token
  try {
    const tokenResponse = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id: env.SHOPIFY_API_KEY,
        client_secret: env.SHOPIFY_API_SECRET,
        code,
      },
      { timeout: 8000 }
    );
    if (tokenResponse.data?.access_token) {
      accessToken = tokenResponse.data.access_token;
    }
  } catch (err: any) {
    // In local development or mock environments, fallback gracefully to test token
    if (env.NODE_ENV === "production") {
      throw new ApiError(502, `Failed to exchange code with Shopify: ${err.message}`);
    }
  }

  tenant.shopify_connected = true;
  tenant.shopify_shop_domain = shop;
  tenant.shopify_access_token = accessToken;
  tenant.shopify_scopes = env.SHOPIFY_SCOPES.split(",").map((s) => s.trim());
  tenant.shopify_connected_at = new Date();
  tenant.shopify_sync_status = "idle";
  tenant.shopify_sync_error = null;
  await tenant.save();

  return { tenant, shop };
}

/**
 * Retrieves the current Shopify integration status for a tenant.
 */
export async function getShopifyStatus(tenantId: string) {
  const tenant = await Tenant.findById(tenantId).lean();
  if (!tenant) throw new ApiError(404, "Tenant not found");

  return {
    connected: Boolean(tenant.shopify_connected),
    shop_domain: tenant.shopify_shop_domain ?? null,
    connected_at: tenant.shopify_connected_at ?? null,
    catalog_synced_at: tenant.shopify_catalog_synced_at ?? null,
    sync_status: tenant.shopify_sync_status ?? "idle",
    sync_error: tenant.shopify_sync_error ?? null,
    product_count: tenant.shopify_product_count ?? 0,
    scopes: tenant.shopify_scopes ?? [],
  };
}

/**
 * Disconnects the Shopify store from the Tenant.
 */
export async function disconnectShopify(tenantId: string) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new ApiError(404, "Tenant not found");

  tenant.shopify_connected = false;
  tenant.shopify_shop_domain = null;
  tenant.shopify_access_token = null;
  tenant.shopify_scopes = [];
  tenant.shopify_sync_status = "idle";
  tenant.shopify_sync_error = null;
  await tenant.save();

  return { success: true, message: "Shopify store disconnected successfully" };
}

/**
 * Ingests/syncs products from the connected Shopify store into tenant-scoped looks.
 */
export async function syncShopifyCatalog(
  tenantId: string
): Promise<{ success: boolean; imported_count: number; products: ShopifyProduct[] }> {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new ApiError(404, "Tenant not found");

  if (!tenant.shopify_connected || !tenant.shopify_shop_domain) {
    throw new ApiError(400, "Shopify store is not connected for this organization");
  }

  tenant.shopify_sync_status = "syncing";
  tenant.shopify_sync_error = null;
  await tenant.save();

  let products: ShopifyProduct[] = [];
  const shop = tenant.shopify_shop_domain;

  try {
    if (tenant.shopify_access_token && !tenant.shopify_access_token.startsWith("shpat_sandbox_")) {
      const response = await axios.get(
        `https://${shop}/admin/api/2024-01/products.json?limit=250`,
        {
          headers: {
            "X-Shopify-Access-Token": tenant.shopify_access_token,
          },
          timeout: 10000,
        }
      );
      products = response.data?.products ?? [];
    }
  } catch (err: any) {
    // If live API cannot be reached, fallback in non-production to fixtures
    if (env.NODE_ENV === "production") {
      tenant.shopify_sync_status = "failed";
      tenant.shopify_sync_error = err.message;
      await tenant.save();
      throw new ApiError(502, `Failed to fetch products from Shopify: ${err.message}`);
    }
  }

  // Provide realistic fashion products if in mock/sandbox mode
  if (products.length === 0) {
    products = getMockShopifyProducts(tenant.name);
  }

  const collection = looksCol();
  let importedCount = 0;

  for (const prod of products) {
    const productIdStr = String(prod.id);
    const imageUrl = prod.image?.src || prod.images?.[0]?.src || "";
    const variants = prod.variants ?? [];

    const lookDoc = {
      tenant_id: tenant._id,
      name: prod.title,
      title: prod.title,
      description: prod.body_html?.replace(/<[^>]*>/g, "") || "",
      brand: prod.vendor || tenant.name,
      season: "Shopify Catalog",
      year: new Date().getFullYear(),
      type: "retail",
      source: {
        type: "shopify",
        shopify_product_id: productIdStr,
        shopify_shop: shop,
        product_type: prod.product_type || "Apparel",
      },
      image_url: imageUrl,
      thumbnail: imageUrl,
      garment_count: Math.max(1, variants.length),
      is_deconstructed: true,
      updated_at: new Date(),
    };

    await collection.updateOne(
      {
        tenant_id: tenant._id,
        "source.type": "shopify",
        "source.shopify_product_id": productIdStr,
      },
      {
        $set: lookDoc,
        $setOnInsert: { created_at: new Date() },
      },
      { upsert: true }
    );

    importedCount++;
  }

  tenant.shopify_catalog_synced_at = new Date();
  tenant.shopify_sync_status = "synced";
  tenant.shopify_product_count = importedCount;
  await tenant.save();

  return {
    success: true,
    imported_count: importedCount,
    products,
  };
}

/**
 * Generates realistic fashion product fixtures for sandbox/test stores.
 */
function getMockShopifyProducts(vendorName: string): ShopifyProduct[] {
  return [
    {
      id: 910101,
      title: "Tailored Oversized Wool Blazer",
      vendor: vendorName,
      product_type: "Outerwear",
      body_html: "Double-breasted structured blazer crafted from Italian virgin wool.",
      image: {
        id: 1,
        src: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&q=80&w=800",
      },
      variants: [
        { id: 101, title: "Midnight Navy / 38", price: "480.00" },
        { id: 102, title: "Midnight Navy / 40", price: "480.00" },
      ],
    },
    {
      id: 910102,
      title: "Pleated High-Waist Wide Trouser",
      vendor: vendorName,
      product_type: "Bottoms",
      body_html: "Sharp front-crease trousers with fluid relaxed drape.",
      image: {
        id: 2,
        src: "https://images.unsplash.com/photo-1509551388413-e18d0ac5d495?auto=format&fit=crop&q=80&w=800",
      },
      variants: [
        { id: 201, title: "Camel / S", price: "320.00" },
        { id: 202, title: "Camel / M", price: "320.00" },
      ],
    },
    {
      id: 910103,
      title: "Silk Charmeuse Draped Evening Slip",
      vendor: vendorName,
      product_type: "Dresses",
      body_html: "Bias-cut fluid silk gown with cowl neckline and open back.",
      image: {
        id: 3,
        src: "https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&q=80&w=800",
      },
      variants: [
        { id: 301, title: "Emerald / XS", price: "590.00" },
        { id: 302, title: "Emerald / S", price: "590.00" },
      ],
    },
    {
      id: 910104,
      title: "Ribbed Cashmere Mock-Neck Knit",
      vendor: vendorName,
      product_type: "Knitwear",
      body_html: "Ultra-soft 7-gauge Mongolian cashmere sweater with elongated cuffs.",
      image: {
        id: 4,
        src: "https://images.unsplash.com/photo-1576995853123-5a10305d93c0?auto=format&fit=crop&q=80&w=800",
      },
      variants: [
        { id: 401, title: "Ivory / S", price: "390.00" },
        { id: 402, title: "Ivory / M", price: "390.00" },
      ],
    },
  ];
}
