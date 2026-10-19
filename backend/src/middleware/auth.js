import jwt from "jsonwebtoken";
import { ApiError } from "../utils/api-error.js";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export function requireTenant(req, res, next) {
  if (!req.user) throw new ApiError(401, "Not authenticated");
  if (!req.user.tenantId && !req.tenantId) throw new ApiError(403, "Tenant context required");
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) throw new ApiError(401, "Not authenticated");
  if (req.user.role !== "admin") throw new ApiError(403, "Admin access required");
  next();
}
