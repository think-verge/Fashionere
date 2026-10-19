import crypto from "node:crypto";
import { Tenant } from "../models/Tenant.js";
import { TenantInvite } from "../models/TenantInvite.js";
import { ApiError } from "../utils/api-error.js";
import { env } from "../config/env.js";

export async function listTenantsForAdmin() {
  const tenants = await Tenant.find()
    .populate("owner_id", "email name role")
    .sort({ createdAt: -1 })
    .lean();
  return tenants;
}

export async function createTenantInvite(adminId: string, email: string, tenantId: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new ApiError(400, "Valid email is required");
  }

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw new ApiError(404, "Tenant not found");
  }

  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const invite = await TenantInvite.create({
    token,
    email: normalizedEmail,
    tenant_id: tenant._id,
    tenant_name: tenant.name,
    invited_by: adminId,
    status: "pending",
    expires_at: expiresAt,
  });

  const origin = env.CLIENT_ORIGIN || "http://localhost:5173";
  const inviteUrl = `${origin}/invite/${token}`;

  return {
    invite,
    invite_url: inviteUrl,
  };
}

export async function listTenantInvites() {
  const invites = await TenantInvite.find()
    .populate("invited_by", "name email")
    .populate("accepted_by", "name email")
    .sort({ createdAt: -1 })
    .lean();
  return invites;
}

export async function revokeTenantInvite(inviteId: string) {
  const invite = await TenantInvite.findById(inviteId);
  if (!invite) throw new ApiError(404, "Invite not found");
  if (invite.status === "accepted") {
    throw new ApiError(400, "Cannot revoke an already accepted invite");
  }
  invite.status = "revoked";
  await invite.save();
  return { success: true };
}

export async function previewTenantInvite(token: string) {
  const invite = await TenantInvite.findOne({ token });
  if (!invite) throw new ApiError(404, "Invite link is invalid");
  if (invite.status === "revoked") throw new ApiError(410, "This invitation has been revoked");
  if (invite.status === "accepted") {
    return {
      valid: false,
      already_accepted: true,
      email: invite.email,
      tenant_name: invite.tenant_name,
    };
  }
  if (new Date() > invite.expires_at) {
    invite.status = "expired";
    await invite.save();
    throw new ApiError(410, "This invitation has expired");
  }

  return {
    valid: true,
    email: invite.email,
    tenant_id: String(invite.tenant_id),
    tenant_name: invite.tenant_name,
    expires_at: invite.expires_at,
  };
}

export async function acceptTenantInvite(token: string, userId: string, userTenantId: string) {
  const invite = await TenantInvite.findOne({ token });
  if (!invite) throw new ApiError(404, "Invite link is invalid");
  if (invite.status === "accepted") {
    throw new ApiError(400, "This invitation has already been accepted");
  }
  if (invite.status === "revoked") throw new ApiError(410, "This invitation has been revoked");
  if (new Date() > invite.expires_at) {
    invite.status = "expired";
    await invite.save();
    throw new ApiError(410, "This invitation has expired");
  }

  const targetTenant = await Tenant.findById(invite.tenant_id);
  if (!targetTenant) throw new ApiError(404, "Target tenant no longer exists");

  // Prevent linking tenant to itself
  if (String(targetTenant._id) === String(userTenantId)) {
    throw new ApiError(400, "You already own this tenant account");
  }

  // Add user's tenant into target tenant's shared_with_tenants if not present
  const alreadyShared = (targetTenant.shared_with_tenants || []).some(
    (id) => String(id) === String(userTenantId)
  );
  if (!alreadyShared) {
    targetTenant.shared_with_tenants.push(userTenantId as any);
    await targetTenant.save();
  }

  invite.status = "accepted";
  invite.accepted_at = new Date();
  invite.accepted_by = userId as any;
  await invite.save();

  return {
    success: true,
    message: `You now have shared access to ${targetTenant.name}'s looks and catalog.`,
    tenant_name: targetTenant.name,
    tenant_id: String(targetTenant._id),
  };
}
