import type { Request, Response } from "express";
import * as brandRequestService from "../services/brandRequestService.js";
import { ApiError } from "../utils/api-error.js";

export async function createBrandRequest(req: Request, res: Response) {
  const tenantId = req.tenantId;
  const userId = req.user?.userId;

  if (!tenantId || !userId) {
    throw new ApiError(401, "Tenant context and authentication required");
  }

  const { brand_name, source_type, season, reference_url, notes } = req.body;
  const brandRequest = await brandRequestService.createBrandRequest(tenantId, userId, {
    brand_name,
    source_type,
    season,
    reference_url,
    notes,
  });

  res.status(201).json({
    message: "Brand request submitted successfully",
    brand_request: brandRequest,
  });
}

export async function listMyBrandRequests(req: Request, res: Response) {
  const tenantId = req.tenantId;
  if (!tenantId) {
    throw new ApiError(401, "Tenant context required");
  }

  const requests = await brandRequestService.listMyBrandRequests(tenantId);
  res.json({ requests });
}

export async function listAdminBrandRequests(req: Request, res: Response) {
  const { status, source_type } = req.query as { status?: string; source_type?: string };
  const requests = await brandRequestService.listAdminBrandRequests({
    status: status || undefined,
    source_type: source_type || undefined,
  });

  res.json({ requests });
}

export async function updateBrandRequestStatus(req: Request, res: Response) {
  const id = req.params.id as string;
  const { status, rejection_reason, admin_notes } = req.body;

  if (!status) {
    throw new ApiError(400, "Status is required");
  }

  const updated = await brandRequestService.updateBrandRequestStatus(id, {
    status,
    rejection_reason,
    admin_notes,
  });

  res.json({
    message: `Brand request status updated to '${status}'`,
    brand_request: updated,
  });
}
