import type { Request, Response } from "express";
import * as inventoryService from "../services/inventoryService.js";

export async function getGarmentInventory(_req: Request, res: Response) {
  const data = await inventoryService.getGarmentInventory();
  res.json(data);
}
