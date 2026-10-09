import type { Request, Response } from "express";
import * as packService from "../services/garmentPack/garmentPackService.js";

const p = (req: Request, key: string) => req.params[key] as string;

export async function finalize(req: Request, res: Response) {
  res.json(await packService.setFinalized(p(req, "conceptId"), req.user!.userId, true));
}

export async function unfinalize(req: Request, res: Response) {
  res.json(await packService.setFinalized(p(req, "conceptId"), req.user!.userId, false));
}

export async function startPack(req: Request, res: Response) {
  const force = req.query.force === "true";
  const result = await packService.startGarmentPack(p(req, "conceptId"), req.user!.userId, force);
  res.status(result.started ? 202 : 200).json(result);
}

export async function getPack(req: Request, res: Response) {
  res.json(await packService.getGarmentPack(p(req, "conceptId"), req.user!.userId));
}

export async function streamPack(req: Request, res: Response) {
  const packId = p(req, "packId");
  const pack = await packService.getPackForStream(packId, req.user!.userId);

  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  if (pack.status !== "generating") {
    res.write(`event: pack_done\ndata: ${JSON.stringify({ status: pack.status, total_cost_usd: pack.total_cost_usd })}\n\n`);
    res.end();
    return;
  }
  packService.addPackClient(packId, res);
  req.on("close", () => packService.removePackClient(packId, res));
}

export async function regenerateShot(req: Request, res: Response) {
  res.status(202).json(await packService.regenerateShot(p(req, "packId"), p(req, "shotId"), req.user!.userId));
}

export async function selectShot(req: Request, res: Response) {
  res.json(await packService.selectShotVersion(p(req, "packId"), p(req, "shotId"), req.user!.userId));
}

export async function getShotImage(req: Request, res: Response) {
  const stream = await packService.getShotImage(p(req, "packId"), p(req, "shotId"), req.user!.userId);
  res.set({ "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable" });
  stream.pipe(res);
}

export async function listGarmentConcepts(req: Request, res: Response) {
  const workspaceId = typeof req.query.workspace_id === "string" ? req.query.workspace_id : "";
  if (!workspaceId) {
    res.status(400).json({ error: "workspace_id query parameter is required" });
    return;
  }
  res.json(await packService.listGarmentConcepts(workspaceId, req.user!.userId));
}

export async function moveToGarmentConcepts(req: Request, res: Response) {
  const { workspace_id, concept_ids } = req.body as { workspace_id?: string; concept_ids?: string[] };
  if (!workspace_id) {
    res.status(400).json({ error: "workspace_id is required" });
    return;
  }
  res.status(202).json(await packService.moveToGarmentConcepts(workspace_id, concept_ids ?? [], req.user!.userId));
}

export async function streamWorkspace(req: Request, res: Response) {
  const workspaceId = p(req, "workspaceId");
  await packService.assertWorkspaceStreamAccess(workspaceId, req.user!.userId);
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.write(`event: connected\ndata: ${JSON.stringify({ workspace_id: workspaceId })}\n\n`);
  packService.addWorkspaceClient(workspaceId, res);
  req.on("close", () => packService.removeWorkspaceClient(workspaceId, res));
}
