import { v4 as uuidv4 } from "uuid";
import type { ChildKind } from "../models/Folder.js";
import type { IWorkspaceElement } from "../models/Workspace.js";

/** Display names of the five element folders created under every date/custom folder. */
export const CHILD_FOLDER_NAMES: Record<ChildKind, string> = {
  shots: "shots",
  silhouettes: "silhouettes",
  palettes: "color palettes",
  fabrics: "fabrics",
  patterns: "patterns",
};

export function childKindForElement(type: IWorkspaceElement["element_type"]): ChildKind {
  switch (type) {
    case "silhouette": return "silhouettes";
    case "color": return "palettes";
    case "fabric": return "fabrics";
    case "pattern": return "patterns";
    default: return "shots";
  }
}

/** YYYY-MM-DD for "today" in the given IANA time zone (falls back to UTC). */
export function todayString(tz?: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function dateFolderName(workspaceName: string, date: string): string {
  return `${workspaceName.trim()}-${date}`;
}

/** Stable identity of an element, used to avoid filing the same thing twice. */
export function elementKey(
  e: Pick<IWorkspaceElement, "look_id" | "garment_id" | "element_type" | "data">,
): string {
  const d = (e.data ?? {}) as Record<string, unknown>;
  let ident = "";
  if (e.element_type === "color") {
    const c = (d.colors as Array<{ hex?: string }> | undefined)?.[0];
    ident = (c?.hex ?? (d.hex as string) ?? "").toLowerCase();
  } else if (e.element_type === "fabric") {
    const f = d.fabric as { name?: string } | string | undefined;
    ident = typeof f === "string" ? f : (f?.name ?? "");
  } else if (e.element_type === "pattern") {
    ident = ((d.pattern ?? d.motif ?? "") as string);
  } else {
    ident = ((d.flat_url ?? d.image_url ?? d.garment_type ?? "") as string);
  }
  return [e.look_id ?? "", e.garment_id ?? "", e.element_type, ident].join("|");
}

interface GarmentLike {
  garment_id: string;
  garment_type: string;
  colors: Array<{ hex: string; name?: string; role?: string; pantone?: string }>;
  fabrics: Array<{ name: string; image_url?: string | null }>;
  patterns: Array<{ name: string; motif?: string | null; image_url?: string | null }>;
  flat_url?: string | null;
}

export interface LookLike {
  id: string;
  brand: string;
  name: string;
  images: string[];
  analysis?: Record<string, unknown> | null;
}

type NewElement = Omit<IWorkspaceElement, "folder_id" | "in_builder" | "added_at">;

function base(
  look: LookLike,
  garment_id: string,
  garment_type: string,
  element_type: IWorkspaceElement["element_type"],
  data: Record<string, unknown>,
): NewElement {
  return {
    element_id: uuidv4(),
    look_id: look.id,
    garment_id,
    garment_type,
    element_type,
    data,
    source_brand: look.brand,
    canvas_position: { x: 0, y: 0 },
    row: garment_type,
    canvas_row: null,
  };
}

/**
 * Deconstruct a look (already analysed offline) into workspace elements:
 * one shot per look image, and per garment a silhouette, one element per colour,
 * and one per fabric / pattern. Colours are individual elements because the
 * generator reads a single colour from each element.
 */
export function buildLookElements(look: LookLike, garments: GarmentLike[]): NewElement[] {
  const out: NewElement[] = [];

  look.images.forEach((url, i) => {
    out.push(base(look, `shot:${i}`, "look", "shot", { image_url: url, title: look.name }));
  });

  for (const g of garments) {
    if (g.flat_url) {
      out.push(base(look, g.garment_id, g.garment_type, "silhouette", {
        flat_url: g.flat_url,
        garment_type: g.garment_type,
      }));
    }
    for (const c of g.colors) {
      out.push(base(look, g.garment_id, g.garment_type, "color", { colors: [c] }));
    }
    for (const f of g.fabrics) {
      out.push(base(look, g.garment_id, g.garment_type, "fabric", { fabric: f, image_url: f.image_url }));
    }
    for (const p of g.patterns) {
      out.push(base(look, g.garment_id, g.garment_type, "pattern", {
        pattern: p.name,
        motif: p.motif,
        image_url: p.image_url,
      }));
    }
  }

  if (garments.length === 0 && look.analysis) {
    const a = look.analysis as {
      colors?: Array<{ hex: string; name?: string }>;
      patterns?: Array<{ value: string }>;
      fibers?: Array<{ value: string }>;
      silhouettes?: Array<{ value: string }>;
    };
    for (const c of a.colors ?? []) out.push(base(look, "product", "product", "color", { colors: [c] }));
    for (const p of a.patterns ?? []) out.push(base(look, "product", "product", "pattern", { pattern: p.value }));
    for (const f of a.fibers ?? []) out.push(base(look, "product", "product", "fabric", { fabric: f.value }));
    for (const s of a.silhouettes ?? []) {
      out.push(base(look, "product", "product", "silhouette", { garment_type: s.value.toLowerCase(), flat_url: null }));
    }
  }

  return out;
}

/**
 * Whether an element is part of the AI builder. Legacy elements (no `in_builder`
 * field) count as in the builder; shots never are.
 */
export function isInBuilder(e: Pick<IWorkspaceElement, "element_type" | "in_builder">): boolean {
  return e.element_type !== "shot" && e.in_builder !== false;
}
