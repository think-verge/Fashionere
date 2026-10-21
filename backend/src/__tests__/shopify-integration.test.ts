import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sanitizeShopDomain,
  generateOAuthState,
  verifyOAuthState,
  buildAuthorizationUrl,
  verifyShopifyHmac,
  disconnectShopify,
  syncShopifyCatalog,
  getShopifyStatus,
} from "../services/shopifyService.js";
import { Tenant } from "../models/Tenant.js";
import { ApiError } from "../utils/api-error.js";
import mongoose from "mongoose";

vi.mock("../models/Tenant.js", () => ({
  Tenant: {
    findById: vi.fn(),
  },
}));

// Mock mongoose connection.db collection
const mockUpdateOne = vi.fn().mockResolvedValue({ acknowledged: true });
vi.spyOn(mongoose, "connection", "get").mockReturnValue({
  db: {
    collection: vi.fn().mockReturnValue({
      updateOne: mockUpdateOne,
    }),
  },
} as any);

describe("Shopify Integration Service", () => {
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
      const tenantId = "tenant_xyz123";
      const state = generateOAuthState(tenantId);
      expect(typeof state).toBe("string");

      const extractedTenantId = verifyOAuthState(state);
      expect(extractedTenantId).toBe(tenantId);
    });

    it("rejects tampered state nonces", () => {
      const state = generateOAuthState("tenant_abc");
      const tampered = state.slice(0, -4) + "XXXX";
      expect(() => verifyOAuthState(tampered)).toThrow(ApiError);
    });
  });

  describe("Authorization URL Construction", () => {
    it("constructs a valid Shopify authorize URL", () => {
      const result = buildAuthorizationUrl("tenant_123", "acne-studios");
      expect(result.shop).toBe("acne-studios.myshopify.com");
      expect(result.authUrl).toContain("https://acne-studios.myshopify.com/admin/oauth/authorize");
      expect(result.authUrl).toContain("client_id=");
      expect(result.authUrl).toContain("scope=");
      expect(result.authUrl).toContain("redirect_uri=");
      expect(result.authUrl).toContain("state=");
    });
  });

  describe("HMAC Verification", () => {
    it("returns false when HMAC is missing or invalid", () => {
      expect(verifyShopifyHmac({})).toBe(false);
      expect(verifyShopifyHmac({ hmac: "invalid_hmac", shop: "test.myshopify.com" })).toBe(false);
    });
  });

  describe("Shopify Status & Disconnect", () => {
    it("returns formatted status for tenant", async () => {
      vi.mocked(Tenant.findById).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          shopify_connected: true,
          shopify_shop_domain: "zara.myshopify.com",
          shopify_sync_status: "synced",
          shopify_product_count: 42,
        }),
      } as any);

      const status = await getShopifyStatus("tenant_1");
      expect(status.connected).toBe(true);
      expect(status.shop_domain).toBe("zara.myshopify.com");
      expect(status.product_count).toBe(42);
    });

    it("disconnects store and clears credentials", async () => {
      const mockTenant = {
        _id: "tenant_1",
        shopify_connected: true,
        shopify_shop_domain: "zara.myshopify.com",
        shopify_access_token: "token_123",
        save: vi.fn().mockResolvedValue(true),
      };
      vi.mocked(Tenant.findById).mockResolvedValue(mockTenant as any);

      const result = await disconnectShopify("tenant_1");
      expect(result.success).toBe(true);
      expect(mockTenant.shopify_connected).toBe(false);
      expect(mockTenant.shopify_shop_domain).toBeNull();
      expect(mockTenant.shopify_access_token).toBeNull();
      expect(mockTenant.save).toHaveBeenCalledOnce();
    });
  });

  describe("Catalog Sync & Look Ingestion", () => {
    it("rejects sync if tenant is not connected to Shopify", async () => {
      vi.mocked(Tenant.findById).mockResolvedValue({
        _id: "tenant_1",
        shopify_connected: false,
      } as any);

      await expect(syncShopifyCatalog("tenant_1")).rejects.toThrow(ApiError);
    });

    it("ingests products into canonical_looks with tenant scoping", async () => {
      const mockTenant = {
        _id: "tenant_1",
        name: "Acne Studios",
        shopify_connected: true,
        shopify_shop_domain: "acne.myshopify.com",
        shopify_access_token: "shpat_sandbox_test",
        save: vi.fn().mockResolvedValue(true),
      };
      vi.mocked(Tenant.findById).mockResolvedValue(mockTenant as any);

      const result = await syncShopifyCatalog("tenant_1");
      expect(result.success).toBe(true);
      expect(result.imported_count).toBeGreaterThan(0);
      expect(mockUpdateOne).toHaveBeenCalled();

      // Check first upsert call scoping
      const firstCallArgs = mockUpdateOne.mock.calls[0];
      expect(firstCallArgs[0].tenant_id).toBe("tenant_1");
      expect(firstCallArgs[0]["source.type"]).toBe("shopify");
      expect(firstCallArgs[1].$set.brand).toBe("Acne Studios");
      expect(mockTenant.save).toHaveBeenCalled();
    });
  });
});
