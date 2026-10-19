import type { Request, Response } from "express";
import * as inviteService from "../services/tenantInviteService.js";
import { ApiError } from "../utils/api-error.js";

function p(req: Request, key: string): string {
  const v = req.params[key];
  return Array.isArray(v) ? v[0] : (v || "");
}

export async function getAdminTenants(_req: Request, res: Response) {
  const tenants = await inviteService.listTenantsForAdmin();
  res.json({ tenants });
}

export async function createAdminInvite(req: Request, res: Response) {
  const adminId = req.user?.userId;
  if (!adminId) throw new ApiError(401, "Not authenticated");

  const { email, tenant_id } = req.body;
  if (!email || !tenant_id) {
    throw new ApiError(400, "Both 'email' and 'tenant_id' are required");
  }

  const result = await inviteService.createTenantInvite(adminId, email, tenant_id);
  res.status(201).json(result);
}

export async function listAdminInvites(_req: Request, res: Response) {
  const invites = await inviteService.listTenantInvites();
  res.json({ invites });
}

export async function revokeAdminInvite(req: Request, res: Response) {
  const result = await inviteService.revokeTenantInvite(p(req, "id"));
  res.json(result);
}

export async function previewInvite(req: Request, res: Response) {
  const preview = await inviteService.previewTenantInvite(p(req, "token"));
  res.json(preview);
}

export async function acceptInvite(req: Request, res: Response) {
  const userId = req.user?.userId;
  const tenantId = req.tenantId || req.user?.tenantId;

  if (!userId || !tenantId) {
    throw new ApiError(401, "Please log in with a valid tenant account to accept this invitation");
  }

  const result = await inviteService.acceptTenantInvite(p(req, "token"), userId, tenantId);
  res.json(result);
}
