import axios from "axios";
import { env } from "../config/env.js";

const deconstructionEngine = axios.create({
  baseURL: env.DECONSTRUCTION_ENGINE_URL,
  timeout: 30_000,
});

export interface LookSummary {
  look_id: string;
  brand: string | null;
  collection_id: string | null;
  runway_url: string | null;
  num_garments: number;
  has_flats: boolean;
}

export interface ColorSwatch {
  name?: string;
  pantone?: string;
  hex?: string;
  role?: string;
}

export interface FabricElement {
  name?: string;
  material?: string;
  weight?: string;
  finish?: string;
  description?: string;
  confidence?: string;
  swatch_url?: string;
}

export interface PatternElement {
  name?: string;
  motif?: string;
  type?: string;
  scale?: string;
  colors?: string[];
  description?: string;
  swatch_url?: string;
}

export interface Garment {
  garment_id: string | null;
  piece: string | null;
  colors: ColorSwatch[];
  flat: string | null;
  fabrics: FabricElement[];
  patterns: PatternElement[];
}

export interface LookDetail {
  look_id: string;
  brand: string | null;
  collection_id: string | null;
  runway_url: string | null;
  silhouette: string | null;
  whole_look_flat: string | null;
  garments: Garment[];
  status: string | null;
}

export async function listLooks(brand?: string): Promise<LookSummary[]> {
  const res = await deconstructionEngine.get<LookSummary[]>("/api/looks", {
    params: brand ? { brand } : undefined,
  });
  return res.data;
}

export async function getLook(lookId: string): Promise<LookDetail> {
  const res = await deconstructionEngine.get<LookDetail>(
    `/api/looks/${encodeURIComponent(lookId)}`,
  );
  return res.data;
}

export async function getAsset(gridfsId: string): Promise<{ data: Buffer; contentType: string }> {
  const res = await deconstructionEngine.get<ArrayBuffer>(`/api/assets/${gridfsId}`, {
    responseType: "arraybuffer",
  });
  return {
    data: Buffer.from(res.data),
    contentType: (res.headers["content-type"] as string) ?? "image/png",
  };
}
