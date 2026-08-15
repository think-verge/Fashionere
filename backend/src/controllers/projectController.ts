import type { Request, Response } from "express";
import * as projectService from "../services/projectService.js";

export async function list(req: Request, res: Response) {
  const docs = await projectService.listProjects(req.user!.userId);
  res.json(docs);
}

export async function create(req: Request, res: Response) {
  const { name, description = "", tags = [] } = req.body as {
    name: string;
    description?: string;
    tags?: string[];
  };
  const doc = await projectService.createProject(req.user!.userId, name, description, tags);
  res.status(201).json(doc);
}

export async function getById(req: Request, res: Response) {
  const doc = await projectService.getProject(req.user!.userId, String(req.params.id));
  res.json(doc);
}

export async function update(req: Request, res: Response) {
  const updates = req.body as { name?: string; description?: string; tags?: string[] };
  const doc = await projectService.updateProject(req.user!.userId, String(req.params.id), updates);
  res.json(doc);
}

export async function remove(req: Request, res: Response) {
  await projectService.deleteProject(req.user!.userId, String(req.params.id));
  res.status(204).send();
}
