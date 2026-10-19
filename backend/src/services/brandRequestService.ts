import { BrandRequest } from "../models/BrandRequest.js";
import { Tenant } from "../models/Tenant.js";
import { ApiError } from "../utils/api-error.js";

export interface CreateBrandRequestInput {
  brand_name: string;
  source_type: "runway" | "retail";
  season?: string;
  reference_url?: string;
  notes?: string;
}

export interface UpdateBrandRequestStatusInput {
  status: "pending" | "approved" | "deconstructing" | "completed" | "rejected";
  rejection_reason?: string;
  admin_notes?: string;
}

export async function createBrandRequest(
  tenantId: string,
  userId: string,
  input: CreateBrandRequestInput
) {
  const brandName = input.brand_name?.trim();
  if (!brandName) {
    throw new ApiError(400, "Brand name is required");
  }

  if (!["runway", "retail"].includes(input.source_type)) {
    throw new ApiError(400, "Source type must be either 'runway' or 'retail'");
  }

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw new ApiError(404, "Tenant not found");
  }

  // Prevent duplicate active requests for the exact same brand under the same tenant
  const existingActive = await BrandRequest.findOne({
    tenant_id: tenantId,
    brand_name: new RegExp(`^${brandName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    source_type: input.source_type,
    status: { $in: ["pending", "approved", "deconstructing"] },
  });

  if (existingActive) {
    throw new ApiError(
      409,
      `A request for '${brandName}' (${input.source_type}) is already ${existingActive.status}`
    );
  }

  const brandRequest = await BrandRequest.create({
    tenant_id: tenantId,
    requested_by: userId,
    brand_name: brandName,
    source_type: input.source_type,
    season: input.season?.trim() || undefined,
    reference_url: input.reference_url?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    status: "pending",
  });

  return brandRequest;
}

export async function listMyBrandRequests(tenantId: string) {
  const requests = await BrandRequest.find({ tenant_id: tenantId })
    .populate("requested_by", "name email")
    .sort({ createdAt: -1 })
    .lean();
  return requests;
}

export async function listAdminBrandRequests(filters?: { status?: string; source_type?: string }) {
  const query: Record<string, unknown> = {};

  if (filters?.status) {
    query.status = filters.status;
  }
  if (filters?.source_type) {
    query.source_type = filters.source_type;
  }

  const requests = await BrandRequest.find(query)
    .populate("tenant_id", "name slug plan")
    .populate("requested_by", "name email")
    .sort({ createdAt: -1 })
    .lean();

  return requests;
}

export async function updateBrandRequestStatus(
  requestId: string,
  input: UpdateBrandRequestStatusInput
) {
  const validStatuses = ["pending", "approved", "deconstructing", "completed", "rejected"];
  if (!validStatuses.includes(input.status)) {
    throw new ApiError(400, `Invalid status. Must be one of: ${validStatuses.join(", ")}`);
  }

  const request = await BrandRequest.findById(requestId);
  if (!request) {
    throw new ApiError(404, "Brand request not found");
  }

  request.status = input.status;
  if (input.rejection_reason !== undefined) {
    request.rejection_reason = input.rejection_reason;
  }
  if (input.admin_notes !== undefined) {
    request.admin_notes = input.admin_notes;
  }

  await request.save();
  return request;
}
