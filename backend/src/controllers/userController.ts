import type { Request, Response } from "express";
import * as authService from "../services/authService.js";

export async function updateProfile(req: Request, res: Response) {
  const { name } = req.body as { name: string };
  const user = await authService.updateProfile(req.user!.userId, name);
  res.json(user);
}
