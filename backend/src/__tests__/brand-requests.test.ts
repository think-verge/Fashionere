import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createBrandRequest,
  updateBrandRequestStatus,
} from "../services/brandRequestService.js";
import { BrandRequest } from "../models/BrandRequest.js";
import { Tenant } from "../models/Tenant.js";
import { ApiError } from "../utils/api-error.js";

vi.mock("../models/BrandRequest.js", () => ({
  BrandRequest: {
    findOne: vi.fn(),
    create: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
  },
}));

vi.mock("../models/Tenant.js", () => ({
  Tenant: {
    findById: vi.fn(),
  },
}));

describe("Brand Request Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws 400 if brand name is missing or empty", async () => {
    await expect(
      createBrandRequest("tenant_1", "user_1", {
        brand_name: "  ",
        source_type: "runway",
      })
    ).rejects.toThrow(ApiError);
  });

  it("throws 400 if source type is invalid", async () => {
    await expect(
      createBrandRequest("tenant_1", "user_1", {
        brand_name: "Jacquemus",
        source_type: "invalid" as any,
      })
    ).rejects.toThrow(ApiError);
  });

  it("throws 404 if tenant does not exist", async () => {
    vi.mocked(Tenant.findById).mockResolvedValue(null as any);

    await expect(
      createBrandRequest("tenant_unknown", "user_1", {
        brand_name: "Jacquemus",
        source_type: "runway",
      })
    ).rejects.toThrow(ApiError);
  });

  it("throws 409 if active request already exists for that brand and tenant", async () => {
    vi.mocked(Tenant.findById).mockResolvedValue({ _id: "tenant_1" } as any);
    vi.mocked(BrandRequest.findOne).mockResolvedValue({
      _id: "req_existing",
      brand_name: "Jacquemus",
      status: "pending",
    } as any);

    await expect(
      createBrandRequest("tenant_1", "user_1", {
        brand_name: "Jacquemus",
        source_type: "runway",
      })
    ).rejects.toThrow(ApiError);
  });

  it("creates a brand request successfully when input is valid", async () => {
    vi.mocked(Tenant.findById).mockResolvedValue({ _id: "tenant_1" } as any);
    vi.mocked(BrandRequest.findOne).mockResolvedValue(null);
    vi.mocked(BrandRequest.create).mockResolvedValue({
      _id: "req_new",
      tenant_id: "tenant_1",
      requested_by: "user_1",
      brand_name: "Jacquemus",
      source_type: "runway",
      status: "pending",
    } as any);

    const result = await createBrandRequest("tenant_1", "user_1", {
      brand_name: "Jacquemus",
      source_type: "runway",
      season: "Fall 2025",
    });

    expect(result).toBeDefined();
    expect(result.brand_name).toBe("Jacquemus");
    expect(BrandRequest.create).toHaveBeenCalledOnce();
  });

  it("updateBrandRequestStatus rejects invalid status", async () => {
    await expect(
      updateBrandRequestStatus("req_1", { status: "unknown_status" as any })
    ).rejects.toThrow(ApiError);
  });

  it("updateBrandRequestStatus updates status and notes successfully", async () => {
    const mockRequest = {
      _id: "req_1",
      status: "pending",
      save: vi.fn().mockResolvedValue(true),
    };
    vi.mocked(BrandRequest.findById).mockResolvedValue(mockRequest as any);

    const updated = await updateBrandRequestStatus("req_1", {
      status: "deconstructing",
      admin_notes: "Scraping engine running for Jacquemus FW25",
    });

    expect(updated.status).toBe("deconstructing");
    expect(mockRequest.save).toHaveBeenCalledOnce();
  });
});
