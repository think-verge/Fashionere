import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import axios from "axios";
import mongoose from "mongoose";
import {
  sanitizeShopDomain,
  generateOAuthState,
  verifyOAuthState,
  buildAuthorizationUrl,
  verifyShopifyHmac,
  verifyWebhookHmac,
  disconnectShopify,
  syncShopifyCatalog,
  getShopifyStatus,
  handleShopifyWebhook,
  GRAPHQL_PRODUCTS_QUERY,
} from "../services/shopifyService.js";
import { Tenant } from "../models/Tenant.js";
import { ShopifyConnection } from "../models/ShopifyConnection.js";
import { ApiError } from "../utils/api-error.js";
import { env } from "../config/env.js";

vi.mock("axios");

vi.mock("../models/Tenant.js", () => ({
  Tenant: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}));

vi.mock("../models/ShopifyConnection.js", () => ({
  ShopifyConnection: {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));

// Mock mongoose connection.db collection
const mockUpdateOne = vi.fn().mockResolvedValue({ acknowledged: true });
const mockDeleteOne = vi.fn().mockResolvedValue({ acknowledged: true });
const mockDeleteMany = vi.fn().mockResolvedValue({ acknowledged: true });

vi.spyOn(mongoose, "connection", "get").mockReturnValue({
  db: {
    collection: vi.fn().mockReturnValue({
      updateOne: mockUpdateOne,
      deleteOne: mockDeleteOne,
      deleteMany: mockDeleteMany,
    }),
  },
} as any);

describe("Shopify Integration Service (Ticket #171)", () => {
  const dummyTenantId = new mongoose.Types.ObjectId().toString();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Shop Domain Sanitization", () => {
    it("sanitizes bare store names to .myshopify.com", () => {
      expect(sanitizeShopDomain("my-brand")).toBe("my-brand.myshopify.com");
    });

    it("sanitizes full https URLs with trailing slashes", () => {
      expect(sanitizeShopDomain("https://gucci-collab.myshopify.com/admin")).toBe(
        "gucci-collab.myshopify.com"
      );
    });

    it("rejects invalid domains or empty values", () => {
      expect(() => sanitizeShopDomain("")).toThrow(ApiError);
      expect(() => sanitizeShopDomain("invalid store name!#$")).toThrow(ApiError);
    });
  });

  describe("OAuth State Nonce Security", () => {
    it("generates and verifies state nonce embedding tenantId", () => {
      const state = generateOAuthState(dummyTenantId);
      expect(typeof state).toBe("string");

      const extractedTenantId = verifyOAuthState(state);
      expect(extractedTenantId).toBe(dummyTenantId);
    });

    it("rejects tampered state nonces", () => {
      const state = generateOAuthState(dummyTenantId);
      const tampered = state.slice(0, -4) + "XXXX";
      expect(() => verifyOAuthState(tampered)).toThrow(ApiError);
    });
  });

  describe("Authorization URL Construction", () => {
    it("constructs a valid Shopify authorize URL", () => {
      const result = buildAuthorizationUrl(dummyTenantId, "acne-studios");
      expect(result.shop).toBe("acne-studios.myshopify.com");
      expect(result.authUrl).toContain("https://acne-studios.myshopify.com/admin/oauth/authorize");
      expect(result.authUrl).toContain("client_id=");
      expect(result.authUrl).toContain("scope=");
      expect(result.authUrl).toContain("redirect_uri=");
      expect(result.authUrl).toContain("state=");
    });
  });

  describe("HMAC Signatures (Query and Webhook)", () => {
    it("validates query HMAC signatures accurately", () => {
      expect(verifyShopifyHmac({})).toBe(false);
      expect(verifyShopifyHmac({ hmac: "invalid_hmac", shop: "test.myshopify.com" })).toBe(false);
    });

    it("verifies Shopify Webhook HMAC header (Base64)", () => {
      const payload = JSON.stringify({ id: 12345, title: "Silk Shirt" });
      const validHmac = crypto
        .createHmac("sha256", env.SHOPIFY_API_SECRET)
        .update(payload)
        .digest("base64");

      expect(verifyWebhookHmac(payload, validHmac)).toBe(true);
      expect(verifyWebhookHmac(payload, "invalid_hmac_header")).toBe(false);
      expect(verifyWebhookHmac(payload, undefined)).toBe(false);
    });
  });

  describe("Shopify Connection Status & Disconnect (TODO #2)", () => {
    it("returns formatted status from ShopifyConnection and Tenant", async () => {
      vi.mocked(Tenant.findById).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: dummyTenantId,
          name: "Acne Studios",
          shopify_connected: true,
          shopify_shop_domain: "acne.myshopify.com",
        }),
      } as any);

      vi.mocked(ShopifyConnection.findOne).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          tenant_id: dummyTenantId,
          shop_domain: "acne.myshopify.com",
          status: "active",
          product_count: 55,
          scopes: ["read_products"],
          last_synced_at: new Date(),
        }),
      } as any);

      const status = await getShopifyStatus(dummyTenantId);
      expect(status.connected).toBe(true);
      expect(status.shop_domain).toBe("acne.myshopify.com");
      expect(status.product_count).toBe(55);
      expect(status.status).toBe("active");
    });

    it("disconnects store and updates both Tenant and ShopifyConnection models", async () => {
      const mockTenant = {
        _id: dummyTenantId,
        shopify_connected: true,
        shopify_shop_domain: "acne.myshopify.com",
        save: vi.fn().mockResolvedValue(true),
      };
      vi.mocked(Tenant.findById).mockResolvedValue(mockTenant as any);
      vi.mocked(ShopifyConnection.findOneAndUpdate).mockResolvedValue({} as any);

      const result = await disconnectShopify(dummyTenantId);
      expect(result.success).toBe(true);
      expect(mockTenant.shopify_connected).toBe(false);
      expect(mockTenant.shopify_shop_domain).toBeNull();
      expect(mockTenant.save).toHaveBeenCalledOnce();
      expect(ShopifyConnection.findOneAndUpdate).toHaveBeenCalledWith(
        { tenant_id: dummyTenantId },
        { status: "disconnected", access_token: "" }
      );
    });
  });

  describe("Shopify Admin GraphQL Catalog Sync with Cursor Pagination (TODO #4)", () => {
    it("rejects sync if tenant is not connected or connection inactive", async () => {
      vi.mocked(Tenant.findById).mockResolvedValue({ _id: dummyTenantId } as any);
      vi.mocked(ShopifyConnection.findOne).mockResolvedValue({ status: "disconnected" } as any);

      await expect(syncShopifyCatalog(dummyTenantId)).rejects.toThrow(ApiError);
    });

    it("paginates GraphQL products query using cursor and updates canonical_looks", async () => {
      const mockConnection = {
        tenant_id: dummyTenantId,
        shop_domain: "acne.myshopify.com",
        access_token: "shpat_live_prod_token",
        status: "active",
        save: vi.fn().mockResolvedValue(true),
      };

      vi.mocked(Tenant.findById).mockResolvedValue({
        _id: dummyTenantId,
        name: "Acne Studios",
      } as any);
      vi.mocked(ShopifyConnection.findOne).mockResolvedValue(mockConnection as any);

      // Mock first page response with next cursor, and second page closing pagination
      vi.mocked(axios.post)
        .mockResolvedValueOnce({
          data: {
            data: {
              products: {
                pageInfo: { hasNextPage: true, endCursor: "cursor_page_1" },
                edges: [
                  {
                    cursor: "cursor_page_1",
                    node: {
                      id: "gid://shopify/Product/1001",
                      title: "Oversized Wool Coat",
                      descriptionHtml: "<p>Luxurious winter coat</p>",
                      vendor: "Acne Studios",
                      productType: "Outerwear",
                      tags: ["coat", "wool"],
                      images: {
                        edges: [{ node: { id: "img_1", url: "https://img.test/coat.jpg" } }],
                      },
                      variants: {
                        edges: [{ node: { id: "var_1", title: "M", price: "950.00" } }],
                      },
                    },
                  },
                ],
              },
            },
            extensions: {
              cost: { throttleStatus: { currentlyAvailable: 800 } },
            },
          },
        })
        .mockResolvedValueOnce({
          data: {
            data: {
              products: {
                pageInfo: { hasNextPage: false, endCursor: null },
                edges: [
                  {
                    cursor: "cursor_page_2",
                    node: {
                      id: "gid://shopify/Product/1002",
                      title: "Tailored Trousers",
                      descriptionHtml: "<p>Italian wool</p>",
                      vendor: "Acne Studios",
                      productType: "Bottoms",
                      tags: "trousers, formal",
                      images: {
                        edges: [{ node: { id: "img_2", url: "https://img.test/pant.jpg" } }],
                      },
                      variants: {
                        edges: [{ node: { id: "var_2", title: "32", price: "420.00" } }],
                      },
                    },
                  },
                ],
              },
            },
            extensions: {
              cost: { throttleStatus: { currentlyAvailable: 750 } },
            },
          },
        });

      const result = await syncShopifyCatalog(dummyTenantId);
      expect(result.success).toBe(true);
      expect(result.imported_count).toBe(2);
      expect(axios.post).toHaveBeenCalledTimes(2);

      // Verify GraphQL query payload
      expect(vi.mocked(axios.post).mock.calls[0][1]).toEqual({
        query: GRAPHQL_PRODUCTS_QUERY,
        variables: { first: 50, after: null },
      });
      expect(vi.mocked(axios.post).mock.calls[1][1]).toEqual({
        query: GRAPHQL_PRODUCTS_QUERY,
        variables: { first: 50, after: "cursor_page_1" },
      });

      // Verify canonical_looks upsert
      expect(mockUpdateOne).toHaveBeenCalledTimes(2);
      const firstUpsert = mockUpdateOne.mock.calls[0];
      expect(firstUpsert[0].tenant_id).toBe(dummyTenantId);
      expect(firstUpsert[0]["source.shopify_product_id"]).toBe("1001");
      expect(firstUpsert[1].$set.brand).toBe("Acne Studios");
      expect(firstUpsert[1].$set.image_url).toBe("https://img.test/coat.jpg");
    });
  });

  describe("Shopify Webhooks Handling (TODO #7 & #9)", () => {
    it("handles products/create and products/update by upserting into canonical_looks", async () => {
      vi.mocked(ShopifyConnection.findOne).mockResolvedValue({
        tenant_id: dummyTenantId,
        shop_domain: "acne.myshopify.com",
      } as any);

      const payload = {
        id: 888123,
        title: "Cashmere Scarf",
        vendor: "Acne Studios",
        body_html: "Soft cashmere",
        image: { src: "https://img.test/scarf.jpg" },
        variants: [{ id: 1, title: "One Size", price: "220.00" }],
      };

      const result = await handleShopifyWebhook("products/create", "acne.myshopify.com", payload);
      expect(result.handled).toBe(true);
      expect(result.action).toBe("product_upserted");
      expect(mockUpdateOne).toHaveBeenCalled();

      const callArgs = mockUpdateOne.mock.calls[0];
      expect(callArgs[0].tenant_id).toBe(dummyTenantId);
      expect(callArgs[0]["source.shopify_product_id"]).toBe("888123");
    });

    it("handles products/delete by removing the product from canonical_looks", async () => {
      vi.mocked(ShopifyConnection.findOne).mockResolvedValue({
        tenant_id: dummyTenantId,
        shop_domain: "acne.myshopify.com",
      } as any);

      const result = await handleShopifyWebhook("products/delete", "acne.myshopify.com", {
        id: 888123,
      });

      expect(result.handled).toBe(true);
      expect(result.action).toBe("product_deleted");
      expect(mockDeleteOne).toHaveBeenCalledWith({
        tenant_id: dummyTenantId,
        "source.type": "shopify",
        "source.shopify_product_id": "888123",
      });
    });

    it("handles app/uninstalled by disconnecting connection and updating tenant", async () => {
      const mockConn = {
        status: "active",
        access_token: "token_123",
        tenant_id: dummyTenantId,
        save: vi.fn().mockResolvedValue(true),
      };
      vi.mocked(ShopifyConnection.findOne).mockResolvedValue(mockConn as any);
      vi.mocked(Tenant.findByIdAndUpdate).mockResolvedValue({} as any);

      const result = await handleShopifyWebhook("app/uninstalled", "acne.myshopify.com", {});
      expect(result.handled).toBe(true);
      expect(result.action).toBe("app_uninstalled");
      expect(mockConn.status).toBe("disconnected");
      expect(mockConn.access_token).toBe("");
      expect(mockConn.save).toHaveBeenCalled();
      expect(Tenant.findByIdAndUpdate).toHaveBeenCalledWith(dummyTenantId, {
        shopify_connected: false,
      });
    });

    it("handles mandatory GDPR webhooks", async () => {
      vi.mocked(ShopifyConnection.findOne).mockResolvedValue({
        tenant_id: dummyTenantId,
        shop_domain: "acne.myshopify.com",
      } as any);

      const gdprResult = await handleShopifyWebhook(
        "customers/redact",
        "acne.myshopify.com",
        {}
      );
      expect(gdprResult.handled).toBe(true);
      expect(gdprResult.action).toBe("gdpr_acknowledged");

      const shopRedactResult = await handleShopifyWebhook(
        "shop/redact",
        "acne.myshopify.com",
        {}
      );
      expect(shopRedactResult.handled).toBe(true);
      expect(shopRedactResult.action).toBe("shop_redacted");
      expect(mockDeleteMany).toHaveBeenCalledWith({
        tenant_id: dummyTenantId,
        "source.type": "shopify",
      });
    });
  });
});
