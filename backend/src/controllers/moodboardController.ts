import type { Request, Response } from "express";
import * as moodboardService from "../services/moodboardService.js";

export async function createFromQuery(req: Request, res: Response) {
  const { query } = req.body as { query: string };
  const doc = await moodboardService.createFromQuery(req.user!.userId, query);
  res.status(202).json(doc);
}

export async function createFromCatalogue(req: Request, res: Response) {
  const { catalogue_item_id } = req.body as { catalogue_item_id: string };
  const doc = await moodboardService.createFromCatalogue(req.user!.userId, catalogue_item_id);
  res.status(202).json(doc);
}

export async function createFromImage(req: Request, res: Response) {
  const { image_url } = req.body as { image_url: string };
  const doc = await moodboardService.createFromImage(req.user!.userId, image_url);
  res.status(202).json(doc);
}

export async function getById(req: Request, res: Response) {
  const doc = await moodboardService.getById(req.user!.userId, String(req.params.id));
  res.json(doc);
}

export async function list(req: Request, res: Response) {
  const docs = await moodboardService.listByUser(req.user!.userId);
  res.json(docs);
}

export async function deleteById(req: Request, res: Response) {
  await moodboardService.deleteById(req.user!.userId, String(req.params.id));
  res.status(204).send();
}

export async function updateName(req: Request, res: Response) {
  const { name } = req.body as { name: string };
  const doc = await moodboardService.updateName(req.user!.userId, String(req.params.id), name);
  res.json(doc);
}
