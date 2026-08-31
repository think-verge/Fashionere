import type { Request, Response } from "express";
import * as looksService from "../services/looksService.js";

function p(req: Request, key: string): string {
  return req.params[key] as string;
}

function q(req: Request, key: string): string | undefined {
  const v = req.query[key];
  return Array.isArray(v) ? (v[0] as string) : (v as string | undefined);
}

export async function listLooks(req: Request, res: Response) {
  const type = q(req, "type");
  const limit = Math.min(parseInt(q(req, "limit") || "24", 10), 100);
  const cursor = q(req, "cursor");
  const result = await looksService.listLooks({ type, limit, cursor });
  res.json(result);
}

export async function getLook(req: Request, res: Response) {
  const look = await looksService.getLook(p(req, "lookId"));
  res.json(look);
}

export async function getGarments(req: Request, res: Response) {
  const garments = await looksService.getGarments(p(req, "lookId"));
  res.json(garments);
}

export async function getGarment(req: Request, res: Response) {
  const garment = await looksService.getGarment(p(req, "lookId"), p(req, "garmentId"));
  res.json(garment);
}
