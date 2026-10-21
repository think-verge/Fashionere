import type { Request, Response } from "express";
import * as shopifyService from "../services/shopifyService.js";
import { ApiError } from "../utils/api-error.js";
import { env } from "../config/env.js";

/**
 * Initiates the Shopify OAuth flow.
 * GET /api/v1/shopify/auth?shop=my-store.myshopify.com
 */
export async function initiateAuth(req: Request, res: Response) {
  const tenantId = req.tenantId;
  if (!tenantId) {
    throw new ApiError(401, "Tenant context required to connect Shopify store");
  }

  const rawShop = req.query.shop as string;
  if (!rawShop) {
    throw new ApiError(400, "Missing required 'shop' query parameter (e.g. your-store.myshopify.com)");
  }

  const { authUrl, shop } = shopifyService.buildAuthorizationUrl(tenantId, rawShop);

  // If request accepts HTML/redirect, redirect directly; otherwise return JSON URL
  if (req.accepts("html") && req.headers["sec-fetch-dest"] === "document") {
    return res.redirect(authUrl);
  }

  res.json({
    auth_url: authUrl,
    shop,
    message: "Redirect user to auth_url to authorize Shopify store connection",
  });
}

/**
 * OAuth callback endpoint called by Shopify after user authorizes app.
 * GET /api/v1/shopify/callback
 */
export async function handleCallback(req: Request, res: Response) {
  const { tenant, shop } = await shopifyService.handleOAuthCallback(req.query as Record<string, string>);

  const redirectUrl = `${env.CLIENT_ORIGIN}/app/looks?shopify=connected&shop=${encodeURIComponent(
    shop
  )}&tenant=${encodeURIComponent(tenant.name)}`;

  res.redirect(redirectUrl);
}

/**
 * Returns current Shopify connection and sync status for the tenant.
 * GET /api/v1/shopify/status
 */
export async function getStatus(req: Request, res: Response) {
  const tenantId = req.tenantId;
  if (!tenantId) {
    throw new ApiError(401, "Tenant context required");
  }

  const status = await shopifyService.getShopifyStatus(tenantId);
  res.json(status);
}

/**
 * Manually or scheduled sync of products from connected Shopify store into private looks.
 * POST /api/v1/shopify/sync
 */
export async function syncCatalog(req: Request, res: Response) {
  const tenantId = req.tenantId;
  if (!tenantId) {
    throw new ApiError(401, "Tenant context required");
  }

  const result = await shopifyService.syncShopifyCatalog(tenantId);
  res.json({
    message: `Successfully synced ${result.imported_count} products from Shopify into tenant looks`,
    imported_count: result.imported_count,
    products: result.products,
  });
}

/**
 * Disconnects Shopify store and revokes access.
 * POST /api/v1/shopify/disconnect
 */
export async function disconnect(req: Request, res: Response) {
  const tenantId = req.tenantId;
  if (!tenantId) {
    throw new ApiError(401, "Tenant context required");
  }

  const result = await shopifyService.disconnectShopify(tenantId);
  res.json(result);
}

/**
 * Webhook receiver for Shopify store events (products/create, update, delete, app/uninstalled, GDPR).
 * POST /api/v1/shopify/webhooks
 */
export async function handleWebhook(req: Request, res: Response) {
  const topic = (req.headers["x-shopify-topic"] as string)?.toLowerCase();
  const shop = req.headers["x-shopify-shop-domain"] as string;
  const hmacHeader = req.headers["x-shopify-hmac-sha256"] as string;

  if (!topic || !shop) {
    throw new ApiError(
      400,
      "Missing required Shopify webhook headers (x-shopify-topic, x-shopify-shop-domain)"
    );
  }

  const rawBody = (req as any).rawBody || JSON.stringify(req.body);

  if (env.NODE_ENV === "production" && !shopifyService.verifyWebhookHmac(rawBody, hmacHeader)) {
    throw new ApiError(401, "Shopify Webhook HMAC verification failed");
  }

  const result = await shopifyService.handleShopifyWebhook(topic, shop, req.body);
  res.status(200).json({ ok: true, ...result });
}

