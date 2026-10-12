import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/api-error.js";
import { requireTenant } from "../middleware/auth.js";
import { buildTenantFilter } from "../services/looksService.js";

describe("Tenant Middleware and Context Enforcement", () => {
  it("rejects request without user authentication", () => {
    const req = {} as Request;
    const res = {} as Response;
    const next = vi.fn() as NextFunction;

    expect(() => requireTenant(req, res, next)).toThrow(ApiError);
  });

  it("rejects request if user has no tenantId", () => {
    const req = {
      user: {
        userId: "user_123",
        email: "test@example.com",
      },
    } as Request;
    const res = {} as Response;
    const next = vi.fn() as NextFunction;

    expect(() => requireTenant(req, res, next)).toThrow(ApiError);
  });

  it("passes when valid tenantId is present on user or request", () => {
    const req = {
      user: {
        userId: "user_123",
        email: "test@example.com",
        tenantId: "tenant_999",
      },
      tenantId: "tenant_999",
    } as unknown as Request;
    const res = {} as Response;
    const next = vi.fn() as NextFunction;

    expect(() => requireTenant(req, res, next)).not.toThrow();
    expect(next).toHaveBeenCalledOnce();
  });
});

describe("Multi-Tenant Data Isolation and Filter Security", () => {
  it("restricts looks query so Tenant A never sees Tenant B's private documents", () => {
    const filterA = buildTenantFilter("tenant_A");
    expect(filterA.$or).toEqual([
      { tenant_id: null },
      { tenant_id: { $exists: false } },
      { tenant_id: "tenant_A" },
    ]);
  });

  it("scopes Shopify-specific query strictly to the authenticated tenant", () => {
    const shopifyFilter = buildTenantFilter("tenant_A", "shopify");
    expect(shopifyFilter).toEqual({
      "source.type": "shopify",
      tenant_id: "tenant_A",
    });
  });

  it("blocks private look access completely when request has no tenant context", () => {
    const blockedFilter = buildTenantFilter(undefined, "shopify");
    expect(blockedFilter).toEqual({
      _id: { $in: [] },
    });
  });

  it("returns only public catalog looks when unauthenticated or source=catalog", () => {
    const catalogFilter = buildTenantFilter("tenant_A", "catalog");
    expect(catalogFilter).toEqual({
      $or: [
        { tenant_id: null },
        { tenant_id: { $exists: false } },
      ],
      "source.type": { $ne: "shopify" },
    });
  });
});
