import type { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/api-error.js";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ detail: `Route ${req.method} ${req.path} not found` });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ detail: err.message });
  }
  console.error(err);
  res.status(500).json({ detail: "Internal server error" });
}
