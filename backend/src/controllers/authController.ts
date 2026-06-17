import type { Request, Response } from "express";
import * as authService from "../services/authService.js";
import { env } from "../config/env.js";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export async function signup(req: Request, res: Response) {
  const { email, password, name } = req.body as {
    email: string;
    password: string;
    name: string;
  };
  const { token, user } = await authService.signup(email, password, name);
  res.cookie("token", token, COOKIE_OPTIONS);
  res.status(201).json(user);
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as { email: string; password: string };
  const { token, user } = await authService.login(email, password);
  res.cookie("token", token, COOKIE_OPTIONS);
  res.json(user);
}

export async function logout(_req: Request, res: Response) {
  res.clearCookie("token");
  res.json({ ok: true });
}

export async function me(req: Request, res: Response) {
  const user = await authService.getMe(req.user!.userId);
  res.json(user);
}
