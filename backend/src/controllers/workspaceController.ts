import type { Request, Response } from "express";
import * as workspaceService from "../services/workspaceService.js";
import * as folderService from "../services/folderService.js";
import * as lookFiling from "../services/lookFilingService.js";

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

export async function uploadElement(req: Request, res: Response) {
  const { element_type, label, garment_type, folder_id, new_folder_name, tz, in_builder } = req.body as {
    element_type: string;
    label?: string;
    garment_type?: string;
    folder_id?: string;
    new_folder_name?: string;
    tz?: string;
    in_builder?: string;
  };
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  const ws = await workspaceService.uploadElement(
    p(req, "id"),
    req.user!.userId,
    element_type,
    req.file,
    label,
    garment_type,
    { folder_id, new_folder_name, tz, in_builder: in_builder === undefined ? undefined : in_builder === "true" },
  );
  res.json(ws);
}

export async function getVariants(req: Request, res: Response) {
  const variants = await workspaceService.getVariants(p(req, "id"), req.user!.userId, req.query.stage as string);
  res.json(variants);
}

export async function editVariant(req: Request, res: Response) {
  const { instructions } = req.body as { instructions: string };
  const variant = await workspaceService.editVariant(p(req, "id"), req.user!.userId, p(req, "variantId"), instructions);
  res.json(variant);
}

export async function attachInventory(req: Request, res: Response) {
  const { inventoryIds } = req.body as { inventoryIds: string[] };
  const variant = await workspaceService.attachInventory(p(req, "id"), req.user!.userId, p(req, "variantId"), inventoryIds);
  res.json(variant);
}

export async function listFolders(req: Request, res: Response) {
  res.json(await folderService.listFolders(p(req, "id"), req.user!.userId));
}

export async function createFolder(req: Request, res: Response) {
  const { name } = req.body as { name: string };
  res.status(201).json(await folderService.createFolder(p(req, "id"), req.user!.userId, name));
}

export async function renameFolder(req: Request, res: Response) {
  const { name } = req.body as { name: string };
  res.json(await folderService.renameFolder(p(req, "id"), req.user!.userId, p(req, "folderId"), name));
}

export async function deleteFolder(req: Request, res: Response) {
  await folderService.deleteFolder(p(req, "id"), req.user!.userId, p(req, "folderId"));
  res.status(204).send();
}

export async function addLook(req: Request, res: Response) {
  const { look_id, folder_id, tz } = req.body as { look_id?: string; folder_id?: string; tz?: string };
  if (!look_id) {
    res.status(400).json({ error: "look_id is required" });
    return;
  }
  res.json(await lookFiling.addLookToWorkspace(p(req, "id"), req.user!.userId, look_id, { tz, folderId: folder_id }));
}

export async function moveToBuilder(req: Request, res: Response) {
  res.json(await lookFiling.setInBuilder(p(req, "id"), req.user!.userId, req.body ?? {}, true));
}

export async function removeFromBuilder(req: Request, res: Response) {
  res.json(await lookFiling.setInBuilder(p(req, "id"), req.user!.userId, req.body ?? {}, false));
}
