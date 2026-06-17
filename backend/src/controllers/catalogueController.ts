import type { Request, Response } from "express";
import * as catalogueService from "../services/catalogueService.js";

export async function list(_req: Request, res: Response) {
  const items = await catalogueService.listCatalogue();
  res.json(items);
}
