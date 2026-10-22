import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { ApiError } from "../utils/api-error.js";
import { User } from "../models/User.js";
import { ensureUserTenant } from "../services/authService.js";

export interface AuthPayload {
  userId: string;
  email: string;
  role?: "designer" | "retail_chain" | "admin";
  tenantId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
      tenantId?: string;
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const cookieToken = req.cookies?.token as string | undefined;
  const bearerToken = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : undefined;
  const token = cookieToken ?? bearerToken;
  if (!token) throw new ApiError(401, "Not authenticated");

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    req.user = payload;
    if (payload.tenantId) {
      req.tenantId = payload.tenantId;
    } else if (payload.userId) {
      try {
        const user = await User.findById(payload.userId);
        if (user) {
          const tenantId = await ensureUserTenant(user);
          req.tenantId = tenantId;
          req.user.tenantId = tenantId;
        }
      } catch {
        /* ignore fallback lookup errors */
      }
    }
    next();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(401, "Invalid or expired token");
  }
}

export async function requireTenant(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    throw new ApiError(401, "Not authenticated");
  }
  if (!req.user.tenantId && !req.tenantId && req.user.userId) {
    try {
      const user = await User.findById(req.user.userId);
      if (user) {
        const tenantId = await ensureUserTenant(user);
        req.tenantId = tenantId;
        req.user.tenantId = tenantId;
      }
    } catch {
      /* ignore */
    }
  }
  if (!req.user.tenantId && !req.tenantId) {
    throw new ApiError(403, "Tenant context required");
  }
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    throw new ApiError(401, "Not authenticated");
  }
  if (req.user.role !== "admin") {
    throw new ApiError(403, "Admin access required");
  }
  next();
}
