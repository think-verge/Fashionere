import type { Request, Response } from "express";
import * as deconstructionService from "../services/deconstructionService.js";
import type { Garment, LookDetail, LookSummary } from "../services/deconstructionService.js";

const ENGINE_ASSET_PREFIX = "/api/assets/";
const BACKEND_ASSET_PREFIX = "/api/v1/looks/assets/";

/** The engine returns asset URLs relative to itself; rewrite them to point at
 * this backend's proxy route so the browser never talks to the engine directly. */
function rewriteAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith(ENGINE_ASSET_PREFIX)
    ? BACKEND_ASSET_PREFIX + url.slice(ENGINE_ASSET_PREFIX.length)
    : url;
}

function rewriteGarment(garment: Garment): Garment {
  return {
    ...garment,
    flat: rewriteAssetUrl(garment.flat),
    fabrics: garment.fabrics.map((f) => ({ ...f, swatch_url: rewriteAssetUrl(f.swatch_url) ?? undefined })),
    patterns: garment.patterns.map((p) => ({ ...p, swatch_url: rewriteAssetUrl(p.swatch_url) ?? undefined })),
  };
}

function rewriteLook(look: LookDetail): LookDetail {
  return {
    ...look,
    whole_look_flat: rewriteAssetUrl(look.whole_look_flat),
    garments: look.garments.map(rewriteGarment),
  };
}

export async function list(req: Request, res: Response) {
  const { brand } = req.query as { brand?: string };
  const looks: LookSummary[] = await deconstructionService.listLooks(brand);
  res.json(looks);
}

export async function getById(req: Request, res: Response) {
  const look = await deconstructionService.getLook(String(req.params.lookId));
  res.json(rewriteLook(look));
}

export async function getAsset(req: Request, res: Response) {
  const { data, contentType } = await deconstructionService.getAsset(String(req.params.gridfsId));
  res.set("Content-Type", contentType);
  res.set("Cache-Control", "public, max-age=86400");
  res.send(data);
}
