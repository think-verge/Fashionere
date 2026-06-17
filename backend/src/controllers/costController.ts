import type { Request, Response } from "express";
import { estimateCost, type CostInput } from "../services/costService.js";

export async function estimate(req: Request, res: Response) {
  const input = req.body as CostInput;
  const result = estimateCost(input);
  res.json(result);
}
