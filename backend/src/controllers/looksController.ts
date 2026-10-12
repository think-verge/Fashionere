import type { Request, Response } from "express";
import * as looksService from "../services/looksService.js";

function p(req: Request, key: string): string {
  return req.params[key] as string;
}

function q(req: Request, key: string): string | undefined {
  const v = req.query[key];
  return Array.isArray(v) ? (v[0] as string) : (v as string | undefined);
}

export async function listLooksFilters(req: Request, res: Response) {
  const type = q(req, "type");
  const tenantId = req.tenantId || req.user?.tenantId;
  const result = await looksService.listLooksFilters({ type, tenantId });
  res.json(result);
}

export async function listLooks(req: Request, res: Response) {
  const type = q(req, "type");
  const source = q(req, "source");
  const limit = Math.min(parseInt(q(req, "limit") || "24", 10), 100);
  const cursor = q(req, "cursor");
  const brand = q(req, "brand");
  const garment_type = q(req, "garment_type");
  const search = q(req, "q");
  const sort = q(req, "sort");
  const is_deconstructed = q(req, "is_deconstructed") === "true";
  const tenantId = req.tenantId || req.user?.tenantId;
  const result = await looksService.listLooks({ type, source, limit, cursor, brand, garment_type, search, sort, is_deconstructed, tenantId });
  res.json(result);
}

export async function getLook(req: Request, res: Response) {
  const tenantId = req.tenantId || req.user?.tenantId;
  const look = await looksService.getLook(p(req, "lookId"), tenantId);
  res.json(look);
}

export async function getGarments(req: Request, res: Response) {
  const tenantId = req.tenantId || req.user?.tenantId;
  const garments = await looksService.getGarments(p(req, "lookId"), tenantId);
  res.json(garments);
}

export async function getGarment(req: Request, res: Response) {
  const tenantId = req.tenantId || req.user?.tenantId;
  const garment = await looksService.getGarment(p(req, "lookId"), p(req, "garmentId"), tenantId);
  res.json(garment);
}
