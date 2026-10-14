import type { Request, Response } from "express";
import * as shootService from "../services/modelShoot/modelShootService.js";

const p = (req: Request, key: string) => req.params[key] as string;

export async function startShoot(req: Request, res: Response) {
  const { model_config, outfit } = (req.body ?? {}) as { model_config?: Record<string, string>; outfit?: Record<string, string> };
  res.status(202).json(await shootService.startShoot(p(req, "conceptId"), req.user!.userId, model_config, outfit));
}

export async function getShootForConcept(req: Request, res: Response) {
  res.json(await shootService.getShootForConcept(p(req, "conceptId"), req.user!.userId));
}

export async function listShoots(req: Request, res: Response) {
  const workspaceId = typeof req.query.workspace_id === "string" ? req.query.workspace_id : "";
  if (!workspaceId) {
    res.status(400).json({ error: "workspace_id query parameter is required" });
    return;
  }
  res.json(await shootService.listShoots(workspaceId, req.user!.userId));
}

export async function listVariations(req: Request, res: Response) {
  const conceptId = typeof req.query.concept_id === "string" ? req.query.concept_id : "";
  if (!conceptId) {
    res.status(400).json({ error: "concept_id query parameter is required" });
    return;
  }
  res.json(await shootService.listVariations(conceptId, req.user!.userId));
}

export async function getShoot(req: Request, res: Response) {
  res.json(await shootService.getShoot(p(req, "shootId"), req.user!.userId));
}

export async function regenerateMain(req: Request, res: Response) {
  res.status(202).json(await shootService.regenerateMain(p(req, "shootId"), req.user!.userId, req.body ?? {}));
}

export async function selectMain(req: Request, res: Response) {
  res.json(await shootService.selectMainVersion(p(req, "shootId"), p(req, "imageId"), req.user!.userId));
}

export async function generateShots(req: Request, res: Response) {
  const count = (req.body as { count?: number } | undefined)?.count;
  res.status(202).json(await shootService.generateShots(p(req, "shootId"), req.user!.userId, count ?? undefined));
}

export async function writeEditorial(req: Request, res: Response) {
  res.json(await shootService.writeEditorial(p(req, "shootId"), req.user!.userId));
}

export async function deleteShot(req: Request, res: Response) {
  res.json(await shootService.deleteShot(p(req, "shootId"), p(req, "imageId"), req.user!.userId));
}

export async function getImage(req: Request, res: Response) {
  const stream = await shootService.getImageStream(p(req, "shootId"), p(req, "imageId"), req.user!.userId);
  res.set({ "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable" });
  stream.pipe(res);
}
