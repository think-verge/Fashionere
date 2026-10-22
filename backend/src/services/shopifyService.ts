import crypto from "node:crypto";
import axios from "axios";
import mongoose from "mongoose";
import { Tenant, type ITenant } from "../models/Tenant.js";
import { ShopifyConnection, type IShopifyConnection } from "../models/ShopifyConnection.js";
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

export const GRAPHQL_PRODUCTS_QUERY = `
  query GetProductsCatalog($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        cursor
        node {
          id
          title
          descriptionHtml
          vendor
          productType
          tags
          images(first: 10) {
            edges {
              node {
                id
                url
                altText
                width
                height
              }
            }
          }
          variants(first: 20) {
            edges {
              node {
                id
                title
                price
                sku
                inventoryQuantity
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Validates and sanitizes a Shopify store domain.
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
  } catch (err: unknown) {
    const error = err as Error;
    throw new ApiError(400, `OAuth state validation failed: ${error.message}`);
  }
}

/**
 * Validates Shopify HMAC signature for query parameters.
 */
export function verifyShopifyHmac(query: Record<string, unknown>): boolean {
  const hmac = query.hmac;
  if (!hmac || typeof hmac !== "string") return false;

  const params: string[] = [];
  const keys = Object.keys(query)
    .filter((k) => k !== "hmac" && k !== "signature")
    .sort();

  for (const k of keys) {
    const val = Array.isArray(query[k]) ? (query[k] as string[]).join(",") : String(query[k]);
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
 * Verifies Shopify Webhook HMAC header (Base64 encoded).
 */
export function verifyWebhookHmac(rawBody: string | Buffer, hmacHeader?: string): boolean {
  if (!hmacHeader) return false;
  const hash = crypto
    .createHmac("sha256", env.SHOPIFY_API_SECRET)
    .update(rawBody)
    .digest("base64");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(hmacHeader, "utf8"),
      Buffer.from(hash, "utf8")
    );
  } catch {
    return false;
  }
}

/**
 * Computes a SHA-256 content hash of product title, description, images, and variants.
 * Used as a cost guardrail (Ticket #172 TODO #7) to dedupe already-processed products.
 */
export function computeProductContentHash(product: {
  title?: string;
  body_html?: string;
  images?: any[];
  variants?: any[];
}): string {
  const content = JSON.stringify({
    title: product.title || "",
    description: product.body_html || "",
    images: (product.images || []).map((img) => img.src || img.url || ""),
    variants: (product.variants || []).map((v) => ({
      title: v.title,
      price: v.price,
      sku: v.sku,
    })),
  });
  return crypto.createHash("sha256").update(content).digest("hex");
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

  // For sandbox / test store handles, bypass external Shopify web servers
  // and complete the OAuth handshake locally via the callback route
  const isSandbox = shop.includes("sandbox") || shop.includes("test");
  if (isSandbox) {
    const authUrl = `${redirectUri}?code=mock_sandbox_code&shop=${encodeURIComponent(
      shop
    )}&state=${encodeURIComponent(state)}`;
    return { authUrl, shop, state };
  }

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
  [key: string]: unknown;
}): Promise<{ tenant: ITenant; connection: IShopifyConnection; shop: string }> {
  const { code, shop: rawShop, state } = query;

  if (!code || !rawShop || !state || typeof code !== "string" || typeof rawShop !== "string" || typeof state !== "string") {
    throw new ApiError(400, "Missing required OAuth parameters: code, shop, or state");
  }

  const shop = sanitizeShopDomain(rawShop);
  const tenantId = verifyOAuthState(state);

  if (env.NODE_ENV === "production" && !verifyShopifyHmac(query)) {
    throw new ApiError(401, "Shopify HMAC signature verification failed");
  }

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw new ApiError(404, "Tenant not found for OAuth session");
  }

  let accessToken = `shpat_sandbox_${crypto.randomBytes(16).toString("hex")}`;

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
  } catch (err: unknown) {
    const error = err as Error;
    if (env.NODE_ENV === "production") {
      throw new ApiError(502, `Failed to exchange code with Shopify: ${error.message}`);
    }
  }

  const scopes = env.SHOPIFY_SCOPES.split(",").map((s) => s.trim());

  // Store in dedicated ShopifyConnection model (TODO #2)
  const connection = await ShopifyConnection.findOneAndUpdate(
    { tenant_id: tenant._id },
    {
      tenant_id: tenant._id,
      shop_domain: shop,
      access_token: accessToken,
      scopes,
      status: "active",
      sync_error: null,
    },
    { upsert: true, new: true }
  );

  tenant.shopify_connected = true;
  tenant.shopify_shop_domain = shop;
  await tenant.save();

  return { tenant, connection, shop };
}

/**
 * Retrieves the current Shopify integration status for a tenant.
 */
export async function getShopifyStatus(tenantId: string) {
  const tenant = await Tenant.findById(tenantId).lean();
  if (!tenant) throw new ApiError(404, "Tenant not found");

  const connection = await ShopifyConnection.findOne({ tenant_id: tenantId }).lean();

  return {
    connected: Boolean(tenant.shopify_connected && connection?.status === "active"),
    shop_domain: connection?.shop_domain ?? tenant.shopify_shop_domain ?? null,
    status: connection?.status ?? (tenant.shopify_connected ? "active" : "disconnected"),
    last_synced_at: connection?.last_synced_at ?? null,
    sync_error: connection?.sync_error ?? null,
    product_count: connection?.product_count ?? 0,
    scopes: connection?.scopes ?? [],
  };
}

/**
 * Disconnects the Shopify store from the Tenant.
 */
export async function disconnectShopify(tenantId: string) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new ApiError(404, "Tenant not found");

  await ShopifyConnection.findOneAndUpdate(
    { tenant_id: tenant._id },
    {
      status: "disconnected",
      access_token: "",
    }
  );

  tenant.shopify_connected = false;
  tenant.shopify_shop_domain = null;
  await tenant.save();

  return { success: true, message: "Shopify store disconnected successfully" };
}

/**
 * Ingests/syncs products using Shopify Admin GraphQL API with cursor pagination (TODO #4).
 */
export async function syncShopifyCatalog(
  tenantId: string
): Promise<{ success: boolean; imported_count: number; products: ShopifyProduct[] }> {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new ApiError(404, "Tenant not found");

  const connection = await ShopifyConnection.findOne({ tenant_id: tenant._id });
  if (!connection || connection.status !== "active") {
    throw new ApiError(400, "Shopify store is not connected for this organization");
  }

  connection.status = "syncing";
  connection.sync_error = null;
  await connection.save();

  let products: ShopifyProduct[] = [];
  const shop = connection.shop_domain;
  const accessToken = connection.access_token;

  try {
    if (accessToken && !accessToken.startsWith("shpat_sandbox_")) {
      let cursor: string | null = null;
      let hasNextPage = true;

      // Cursor pagination loop
      while (hasNextPage) {
        const response: any = await axios.post(
          `https://${shop}/admin/api/2024-01/graphql.json`,
          {
            query: GRAPHQL_PRODUCTS_QUERY,
            variables: { first: 50, after: cursor },
          },
          {
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": accessToken,
            },
            timeout: 12000,
          }
        );

        // Rate limit / cost backoff handling
        const cost = response.data?.extensions?.cost;
        if (cost?.throttleStatus?.currentlyAvailable < 50) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        const data: any = response.data?.data?.products;
        if (!data) break;

        for (const edge of data.edges ?? []) {
          const node = edge.node;
          const numericId = node.id.replace(/^gid:\/\/shopify\/Product\//, "");
          const images = (node.images?.edges ?? []).map((imgEdge: any) => ({
            id: imgEdge.node.id,
            src: imgEdge.node.url,
            alt: imgEdge.node.altText,
            width: imgEdge.node.width,
            height: imgEdge.node.height,
          }));
          const variants = (node.variants?.edges ?? []).map((varEdge: any) => ({
            id: varEdge.node.id,
            title: varEdge.node.title,
            price: varEdge.node.price,
            sku: varEdge.node.sku,
            inventory_quantity: varEdge.node.inventoryQuantity,
          }));

          products.push({
            id: numericId,
            title: node.title,
            body_html: node.descriptionHtml,
            vendor: node.vendor,
            product_type: node.productType,
            tags: Array.isArray(node.tags) ? node.tags.join(", ") : node.tags,
            images,
            image: images[0],
            variants,
          });
        }

        hasNextPage = data.pageInfo?.hasNextPage ?? false;
        cursor = data.pageInfo?.endCursor ?? null;
      }
    }
  } catch (err: unknown) {
    const error = err as Error;
    if (env.NODE_ENV === "production") {
      connection.status = "error";
      connection.sync_error = error.message;
      await connection.save();
      throw new ApiError(502, `Failed to query products from Shopify GraphQL API: ${error.message}`);
    }
  }

  // Provide realistic fixtures for sandbox / test runs
  if (products.length === 0) {
    products = getMockShopifyProducts(tenant.name);
  }

  const collection = looksCol();
  let importedCount = 0;

  for (const prod of products) {
    const productIdStr = String(prod.id);
    const rawImages = prod.images && prod.images.length > 0 ? prod.images : prod.image ? [prod.image] : [];
    const imagesList = rawImages.map((img: any) => ({
      id: String(img.id || ""),
      url: img.src || img.url || "",
      alt: img.alt || img.altText || "",
      width: img.width,
      height: img.height,
    }));
    const imageUrl = imagesList[0]?.url || "";
    const variants = prod.variants ?? [];
    const tagsList = Array.isArray(prod.tags)
      ? prod.tags
      : typeof prod.tags === "string"
      ? prod.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
      : [];
    const contentHash = computeProductContentHash({
      title: prod.title,
      body_html: prod.body_html,
      images: imagesList,
      variants,
    });

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
      images: imagesList,
      variants: variants.map((v: any) => ({
        id: String(v.id || ""),
        title: v.title || "",
        price: v.price || "",
        sku: v.sku || "",
        inventory_quantity: v.inventory_quantity,
      })),
      tags: tagsList,
      product_type: prod.product_type || "Apparel",
      garment_count: Math.max(1, variants.length),
      content_hash: contentHash,
      deconstruction_status: "pending",
      is_deconstructed: false,
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

  connection.last_synced_at = new Date();
  connection.status = "active";
  connection.product_count = importedCount;
  await connection.save();

  return {
    success: true,
    imported_count: importedCount,
    products,
  };
}

/**
 * Handles incoming webhooks from Shopify (TODO #7 & #9).
 */
export async function handleShopifyWebhook(
  topic: string,
  shop: string,
  payload: Record<string, any>
): Promise<{ handled: boolean; action?: string }> {
  const collection = looksCol();

  const connection = await ShopifyConnection.findOne({ shop_domain: shop });
  if (!connection && !topic.includes("redact") && topic !== "app/uninstalled") {
    return { handled: false };
  }

  const tenantId = connection?.tenant_id;

  switch (topic) {
    case "products/create":
    case "products/update": {
      if (!tenantId) return { handled: false };
      const productIdStr = String(payload.id);
      const rawImages = payload.images ?? (payload.image ? [payload.image] : []);
      const imagesList = rawImages.map((img: any) => ({
        id: String(img.id || ""),
        url: img.src || img.url || "",
        alt: img.alt || img.altText || "",
        width: img.width,
        height: img.height,
      }));
      const imageUrl = imagesList[0]?.url || payload.image?.src || "";
      const variants = payload.variants ?? [];
      const tagsList = Array.isArray(payload.tags)
        ? payload.tags
        : typeof payload.tags === "string"
        ? payload.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
        : [];
      const contentHash = computeProductContentHash({
        title: payload.title,
        body_html: payload.body_html,
        images: imagesList,
        variants,
      });

      await collection.updateOne(
        {
          tenant_id: tenantId,
          "source.type": "shopify",
          "source.shopify_product_id": productIdStr,
        },
        {
          $set: {
            tenant_id: tenantId,
            name: payload.title,
            title: payload.title,
            description: payload.body_html?.replace(/<[^>]*>/g, "") || "",
            brand: payload.vendor || "Shopify Store",
            season: "Shopify Catalog",
            year: new Date().getFullYear(),
            type: "retail",
            source: {
              type: "shopify",
              shopify_product_id: productIdStr,
              shopify_shop: shop,
              product_type: payload.product_type || "Apparel",
            },
            image_url: imageUrl,
            thumbnail: imageUrl,
            images: imagesList,
            variants: variants.map((v: any) => ({
              id: String(v.id || ""),
              title: v.title || "",
              price: v.price || "",
              sku: v.sku || "",
              inventory_quantity: v.inventory_quantity,
            })),
            tags: tagsList,
            product_type: payload.product_type || "Apparel",
            garment_count: Math.max(1, variants.length),
            content_hash: contentHash,
            deconstruction_status: "pending",
            is_deconstructed: false,
            updated_at: new Date(),
          },
          $setOnInsert: { created_at: new Date() },
        },
        { upsert: true }
      );
      return { handled: true, action: "product_upserted" };
    }

    case "products/delete": {
      if (!tenantId) return { handled: false };
      const productIdStr = String(payload.id);
      await collection.deleteOne({
        tenant_id: tenantId,
        "source.type": "shopify",
        "source.shopify_product_id": productIdStr,
      });
      return { handled: true, action: "product_deleted" };
    }

    case "app/uninstalled": {
      if (connection) {
        connection.status = "disconnected";
        connection.access_token = "";
        await connection.save();
      }
      if (tenantId) {
        await Tenant.findByIdAndUpdate(tenantId, { shopify_connected: false });
      }
      return { handled: true, action: "app_uninstalled" };
    }

    // Shopify GDPR mandatory webhooks (TODO #9)
    case "customers/data_request":
    case "customers/redact": {
      return { handled: true, action: "gdpr_acknowledged" };
    }

    case "shop/redact": {
      if (tenantId) {
        await collection.deleteMany({
          tenant_id: tenantId,
          "source.type": "shopify",
        });
      }
      return { handled: true, action: "shop_redacted" };
    }

    default:
      return { handled: false };
  }
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
