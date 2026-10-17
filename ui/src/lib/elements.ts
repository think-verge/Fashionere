export type ElementType = "color" | "fabric" | "pattern" | "silhouette" | "shot";

export interface WorkspaceElement {
  element_id: string;
  look_id?: string;
  garment_id?: string;
  garment_type: string;
  element_type: ElementType;
  data: Record<string, unknown>;
  source_brand: string;
  row: string;
  canvas_row?: number | null;
  canvas_position?: { x?: number; y?: number };
  is_custom?: boolean;
  /** Moodboard folder the element is filed in. */
  folder_id?: string | null;
  /** Moved to the AI builder. Absent on legacy elements, which count as in the builder. */
  in_builder?: boolean;
}

export interface WorkspaceLook {
  look_id: string;
  date_folder_id: string;
  added_at: string;
  thumbnail?: string | null;
  brand?: string;
  title?: string;
}

export interface FolderNode {
  id: string;
  parent_id: string | null;
  name: string;
  kind: "looks_root" | "date" | "custom" | "shots" | "silhouettes" | "palettes" | "fabrics" | "patterns";
  system: boolean;
  date: string | null;
  count: number;
  in_builder_count: number;
}

export const TYPE_ICONS: Record<string, string> = {
  color: "🎨",
  fabric: "🪢",
  pattern: "✦",
  silhouette: "👗",
  shot: "📷",
};

/** Mirrors the backend: legacy elements (no flag) are in the builder; shots never are. */
export function isInBuilder(e: Pick<WorkspaceElement, "element_type" | "in_builder">): boolean {
  return e.element_type !== "shot" && e.in_builder !== false;
}

export function getElementLabel(el: WorkspaceElement): string {
  switch (el.element_type) {
    case "color": {
      const colors = (el.data?.colors as Array<{ name?: string; hex?: string }> | undefined) ?? [];
      if (colors.length === 0) return "Color palette";
      return colors.slice(0, 2).map((c) => c.name || c.hex || "").filter(Boolean).join(", ") || "Color palette";
    }
    case "fabric": {
      const f = el.data?.fabric;
      if (!f) return "Fabric";
      if (typeof f === "string") return f;
      return (f as { name?: string }).name ?? "Fabric";
    }
    case "pattern":
      return (el.data?.pattern as string | undefined) ?? "Pattern";
    case "silhouette":
      return "Technical flat";
    case "shot":
      return (el.data?.title as string | undefined) || "Look shot";
    default:
      return el.element_type;
  }
}

export function getPreviewUrl(el: WorkspaceElement): string | null {
  if (el.element_type === "silhouette") return (el.data?.flat_url as string) ?? null;
  if (el.element_type === "shot") return (el.data?.image_url as string) ?? null;
  if (el.element_type === "fabric") {
    return (el.data?.fabric as { image_url?: string } | undefined)?.image_url ?? (el.data?.image_url as string) ?? null;
  }
  if (el.element_type === "pattern") return (el.data?.image_url as string) ?? null;
  return null;
}

export function getColors(el: WorkspaceElement) {
  return (el.data?.colors as Array<{ hex?: string; name?: string; family?: string }> | undefined) ?? [];
}

/** IANA time zone of the browser, sent so "today's" folder matches the user's day. */
export function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}
