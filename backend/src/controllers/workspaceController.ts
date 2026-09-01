import type { Request, Response } from "express";
import * as workspaceService from "../services/workspaceService.js";

function p(req: Request, key: string): string {
  return req.params[key] as string;
}

function q(req: Request, key: string): string | undefined {
  const v = req.query[key];
  return Array.isArray(v) ? (v[0] as string) : (v as string | undefined);
}

export async function listWorkspaces(req: Request, res: Response) {
  const workspaces = await workspaceService.listWorkspaces(req.user!.userId, q(req, "project_id"));
  res.json(workspaces);
}

export async function getWorkspace(req: Request, res: Response) {
  const ws = await workspaceService.getWorkspace(p(req, "id"), req.user!.userId);
  res.json(ws);
}

export async function createWorkspace(req: Request, res: Response) {
  const { name, project_id } = req.body as { name: string; project_id: string };
  const ws = await workspaceService.createWorkspace(req.user!.userId, project_id, name);
  res.status(201).json(ws);
}

export async function appendElement(req: Request, res: Response) {
  const ws = await workspaceService.appendElement(p(req, "id"), req.user!.userId, req.body);
  res.json(ws);
}

export async function replaceElements(req: Request, res: Response) {
  const { elements } = req.body as { elements: unknown[] };
  const ws = await workspaceService.replaceElements(p(req, "id"), req.user!.userId, elements as never);
  res.json(ws);
}

export async function removeElement(req: Request, res: Response) {
  const ws = await workspaceService.removeElement(p(req, "id"), req.user!.userId, p(req, "elementId"));
  res.json(ws);
}

export async function generate(req: Request, res: Response) {
  const ws = await workspaceService.setGenerating(p(req, "id"), req.user!.userId);
  res.json(ws);
}

export async function renameWorkspace(req: Request, res: Response) {
  const { name } = req.body as { name: string };
  const ws = await workspaceService.renameWorkspace(p(req, "id"), req.user!.userId, name);
  res.json(ws);
}

export async function deleteWorkspace(req: Request, res: Response) {
  await workspaceService.deleteWorkspace(p(req, "id"), req.user!.userId);
  res.status(204).send();
}
