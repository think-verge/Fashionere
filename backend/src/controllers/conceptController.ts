import type { Request, Response } from "express";
import * as conceptService from "../services/conceptService.js";
import { addSSEClient, removeSSEClient } from "../services/conceptService.js";
import type { IComboRef } from "../models/GenerationJob.js";

function p(req: Request, key: string): string {
  return req.params[key] as string;
}

function q(req: Request, key: string): string | undefined {
  const v = req.query[key];
  return Array.isArray(v) ? (v[0] as string) : (v as string | undefined);
}

export async function generate(req: Request, res: Response) {
  const { workspace_id, mode, combo, max_combos } = req.body as {
    workspace_id: string;
    mode: "manual" | "suggest";
    combo?: IComboRef;
    max_combos?: number;
  };

  if (!workspace_id) {
    res.status(400).json({ error: "workspace_id is required" });
    return;
  }
  if (!mode || !["manual", "suggest"].includes(mode)) {
    res.status(400).json({ error: "mode must be 'manual' or 'suggest'" });
    return;
  }
  if (mode === "manual" && !combo) {
    res.status(400).json({ error: "combo is required for manual mode" });
    return;
  }

  const result = await conceptService.generateConcepts(
    workspace_id,
    req.user!.userId,
    mode,
    combo,
    max_combos,
  );

  res.status(201).json(result);
}

export async function getJob(req: Request, res: Response) {
  const job = await conceptService.getJob(p(req, "jobId"), req.user!.userId);
  res.json(job);
}

export async function streamJob(req: Request, res: Response) {
  const jobId = p(req, "jobId");

  const job = await conceptService.getJob(jobId, req.user!.userId);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  if (job.status === "completed" || job.status === "partial_failure") {
    res.write(`event: job_done\ndata: ${JSON.stringify({ status: job.status, total_cost_usd: job.total_cost_usd, concepts_count: job.combos_completed })}\n\n`);
    res.end();
    return;
  }

  const client = { res, jobId };
  addSSEClient(jobId, client);

  req.on("close", () => {
    removeSSEClient(jobId, client);
  });
}

export async function overrideCombos(req: Request, res: Response) {
  const { combos } = req.body as { combos: IComboRef[] };
  if (!combos?.length) {
    res.status(400).json({ error: "combos array is required" });
    return;
  }

  const result = await conceptService.overrideCombos(
    p(req, "jobId"),
    req.user!.userId,
    combos,
  );

  res.json(result);
}

export async function listConcepts(req: Request, res: Response) {
  const workspaceId = q(req, "workspace_id");
  if (!workspaceId) {
    res.status(400).json({ error: "workspace_id query parameter is required" });
    return;
  }

  const concepts = await conceptService.listConcepts(
    workspaceId,
    req.user!.userId,
    q(req, "status"),
    q(req, "job_id"),
    q(req, "finalized") === undefined ? undefined : q(req, "finalized") === "true",
  );
  res.json(concepts);
}

export async function getConcept(req: Request, res: Response) {
  const concept = await conceptService.getConcept(p(req, "conceptId"), req.user!.userId);
  res.json(concept);
}

export async function updateConcept(req: Request, res: Response) {
  const { status } = req.body as { status: "approved" | "rejected" };
  if (!status || !["approved", "rejected"].includes(status)) {
    res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
    return;
  }

  const concept = await conceptService.updateConceptStatus(p(req, "conceptId"), req.user!.userId, status);
  res.json(concept);
}

export async function getConceptImage(req: Request, res: Response) {
  const stream = await conceptService.getConceptImage(p(req, "conceptId"), req.user!.userId);
  res.set("Content-Type", "image/jpeg");
  stream.pipe(res);
}

export async function refine(req: Request, res: Response) {
  const { instruction } = req.body as { instruction: string };
  if (!instruction?.trim()) {
    res.status(400).json({ error: "instruction is required" });
    return;
  }

  const result = await conceptService.refineConcept(
    p(req, "conceptId"),
    req.user!.userId,
    instruction.trim(),
  );

  res.status(201).json(result);
}

export async function getVariants(req: Request, res: Response) {
  const variants = await conceptService.getVariants(p(req, "conceptId"), req.user!.userId);
  res.json(variants);
}
