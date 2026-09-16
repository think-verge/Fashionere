import mongoose from "mongoose";

const ASSET_BASE = process.env.ASSET_BASE_URL ?? "http://localhost:8001/api/v1/assets";

function assetUrl(gridfsId: unknown): string | null {
  return gridfsId ? `${ASSET_BASE}/${String(gridfsId)}` : null;
}

const deconCol = () => mongoose.connection.db!.collection("deconstructions");
const looksCol = () => mongoose.connection.db!.collection("canonical_looks");

export type Stage = "now" | "next" | "emg";

export interface ElementStats {
  count: number;
  total: number;
  rank: number;
  pct: number;
  stage: Stage;
  brands: string[];
}

export interface TrendElement {
  kind: "color" | "fabric" | "pattern";
  family: string;
  stats: ElementStats;
  verdict: { tag: string; pursue: string; body: string };
  designer_cue: string;
  evidence: Array<{
    look_id: string;
    brand: string;
    piece: string;
    image_url: string | null;
    garment_id: string;
  }>;
  image_url?: string | null;
  hex?: string;
}

export interface CategoryOverview {
  garment_type: string;
  total: number;
  colors: TrendElement[];
  fabrics: TrendElement[];
  patterns: TrendElement[];
  silhouettes: Array<{
    look_id: string;
    garment_id: string;
    brand: string;
    piece: string;
    flat_url: string | null;
  }>;
}

interface RawGarment {
  garment_id?: string;
  id?: string;
  piece?: string;
  garment_type?: string;
  colors?: Array<{ hex?: string; name?: string; role?: string; pantone?: string }>;
  fabrics?: Array<{ name?: string; material?: string; gridfs_id?: string }>;
  patterns?: Array<{ name?: string; type?: string; motif?: string; gridfs_id?: string }>;
  flat?: { gridfs_id?: string };
  composition?: Array<{ fiber?: string; pct?: number }>;
}

interface DeconDoc {
  look_id: string;
  garments: RawGarment[];
}

interface Instance {
  lookId: string;
  brand: string;
  garmentId: string;
  piece: string;
  g: RawGarment;
  runwayImg: string | null;
}

const KNOWN_TYPES = [
  "jacket", "coat", "blazer", "vest", "sweater", "cardigan",
  "top", "blouse", "shirt", "t-shirt", "tee",
  "dress", "skirt", "trousers", "pants", "jeans", "shorts",
  "accessory", "bag", "scarf", "hat",
];

function inferGarmentType(g: RawGarment): string {
  if (g.garment_type) return g.garment_type.toLowerCase();
  const piece = (g.piece ?? "").toLowerCase();
  for (const t of KNOWN_TYPES) {
    if (piece.includes(t)) return t;
  }
  return "unknown";
}

let cache: { ts: number; data: Map<string, Instance[]> } | null = null;
const CACHE_TTL = 60_000;

async function loadInstances(): Promise<Map<string, Instance[]>> {
  if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.data;

  const decons = (await deconCol()
    .find({ "garments.0": { $exists: true } })
    .toArray()) as unknown as DeconDoc[];

  const lookIds = decons.map((d) => d.look_id);
  const looks = await looksCol()
    .find({ _id: { $in: lookIds } })
    .project({ "context.brand": 1, "images": 1 })
    .toArray();

  const lookMap = new Map<string, { brand: string; img: string | null }>();
  for (const l of looks) {
    const ctx = (l as Record<string, unknown>).context as Record<string, unknown> | undefined;
    const brand = (ctx?.brand ?? "") as string;
    const imgs = (l as Record<string, unknown>).images as Array<Record<string, unknown>> | undefined;
    const img = imgs?.[0] ? ((imgs[0].url ?? imgs[0].src) as string) : null;
    lookMap.set(String(l._id), { brand, img });
  }

  const byType = new Map<string, Instance[]>();

  for (const d of decons) {
    const info = lookMap.get(d.look_id) ?? { brand: "", img: null };
    for (const g of d.garments) {
      const gt = inferGarmentType(g);
      const inst: Instance = {
        lookId: d.look_id,
        brand: info.brand,
        garmentId: (g.garment_id ?? g.id ?? "") as string,
        piece: (g.piece ?? gt) as string,
        g,
        runwayImg: info.img,
      };
      if (!byType.has(gt)) byType.set(gt, []);
      byType.get(gt)!.push(inst);
    }
  }

  cache = { ts: Date.now(), data: byType };
  return byType;
}

// Recalibrated for a small corpus (15–30 items):
// Now:      ≥20% of garments AND in top 3 by count (at least 2 appearances)
// Next:     appears in ≥2 garments
// Emerging: appears in only 1 garment
function stageFromRank(count: number, total: number, rank: number): Stage {
  const pct = total > 0 ? count / total : 0;
  if (count >= 2 && pct >= 0.2 && rank <= 2) return "now";
  if (count >= 2) return "next";
  return "emg";
}

function colorFamily(hex: string): string {
  if (!hex) return "Unknown";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 510;
  const s = max === min ? 0 : (max - min) / (l > 0.5 ? 510 - max - min : max + min);
  if (s < 0.1) {
    if (l < 0.15) return "Black";
    if (l > 0.85) return "White";
    return "Grey";
  }
  let h = 0;
  if (max === r) h = ((g - b) / (max - min)) * 60;
  else if (max === g) h = (2 + (b - r) / (max - min)) * 60;
  else h = (4 + (r - g) / (max - min)) * 60;
  if (h < 0) h += 360;
  if (h < 15 || h >= 345) return "Red";
  if (h < 40) return "Orange";
  if (h < 70) return "Yellow";
  if (h < 160) return "Green";
  if (h < 200) return "Teal";
  if (h < 260) return "Blue";
  if (h < 290) return "Purple";
  return "Pink";
}

interface ElementEntry {
  family: string;
  inst: Instance;
  imageUrl: string | null;
  hex?: string;
}

interface FamilyRow {
  fam: string;
  count: number;
  brands: Set<string>;
  entries: ElementEntry[];
  imageUrl: string | null;
  hex?: string;
}

// Explode each garment into all its elements of a given kind,
// then group by family name. This counts every element, not just the first.
function buildFamilyTable(
  instances: Instance[],
  explodeFn: (inst: Instance) => ElementEntry[],
): FamilyRow[] {
  const map = new Map<string, FamilyRow>();
  const seen = new Map<string, Set<string>>(); // fam -> set of garmentIds (dedupe within same garment)

  for (const inst of instances) {
    const entries = explodeFn(inst);
    for (const entry of entries) {
      const key = entry.family;
      if (!key || key === "Unknown") continue;

      // Dedupe: count each garment once per family
      const garmentKey = `${inst.lookId}:${inst.garmentId}`;
      if (!seen.has(key)) seen.set(key, new Set());
      if (seen.get(key)!.has(garmentKey)) continue;
      seen.get(key)!.add(garmentKey);

      if (!map.has(key)) {
        map.set(key, { fam: key, count: 0, brands: new Set(), entries: [], imageUrl: null, hex: undefined });
      }
      const row = map.get(key)!;
      row.count++;
      row.brands.add(inst.brand);
      row.entries.push(entry);
      if (!row.imageUrl && entry.imageUrl) row.imageUrl = entry.imageUrl;
      if (!row.hex && entry.hex) row.hex = entry.hex;
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

function verdict(stage: Stage, count: number, total: number, brands: string[]): { tag: string; pursue: string; body: string } {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const brandStr = brands.length > 1 ? `across ${brands.length} brands (${brands.join(", ")})` : `at ${brands[0] || "1 brand"}`;

  switch (stage) {
    case "now":
      return {
        tag: "Safe & current",
        pursue: "Low risk — already validated by the market",
        body: `Appears in ${count} of ${total} garments (${pct}%) ${brandStr}. This is an in-market staple with strong commercial validation across the retail landscape.`,
      };
    case "next":
      return {
        tag: "Rising",
        pursue: "Move now — timing is the edge",
        body: `Appears in ${count} of ${total} garments (${pct}%) ${brandStr}. Building momentum across collections — an opportunity to lead rather than follow.`,
      };
    case "emg":
      return {
        tag: "Whitespace",
        pursue: "High differentiation — own the niche",
        body: `Appears in just ${count} of ${total} garments (${pct}%) ${brandStr}. Rare in the current market — using this signals a bold, forward-looking direction.`,
      };
  }
}

function designerCue(kind: string, family: string, stage: Stage): string {
  if (stage === "now") return `${family} is a validated choice — use it as a foundation, then layer something unexpected on top.`;
  if (stage === "next") return `${family} is gaining traction. Pair it with a trending silhouette for maximum relevance.`;
  return `${family} is whitespace — consider it for a capsule or limited-edition statement piece.`;
}

function buildTrendElement(
  kind: "color" | "fabric" | "pattern",
  row: FamilyRow,
  total: number,
  rank: number,
): TrendElement {
  const stage = stageFromRank(row.count, total, rank);
  const pct = total > 0 ? Math.round((row.count / total) * 100) : 0;
  const brands = [...row.brands];
  return {
    kind,
    family: row.fam,
    stats: {
      count: row.count,
      total,
      rank,
      pct,
      stage,
      brands,
    },
    verdict: verdict(stage, row.count, total, brands),
    designer_cue: designerCue(kind, row.fam, stage),
    evidence: row.entries.slice(0, 6).map((e) => ({
      look_id: e.inst.lookId,
      brand: e.inst.brand,
      piece: e.inst.piece,
      image_url: e.inst.runwayImg,
      garment_id: e.inst.garmentId,
    })),
    image_url: row.imageUrl,
    hex: row.hex,
  };
}

// Exploder functions — return ALL elements of each kind per garment

function explodeColors(inst: Instance): ElementEntry[] {
  return (inst.g.colors ?? []).map((c) => ({
    family: c.name || (c.hex ? colorFamily(c.hex) : "Unknown"),
    inst,
    imageUrl: null,
    hex: c.hex,
  }));
}

function explodeFabrics(inst: Instance): ElementEntry[] {
  return (inst.g.fabrics ?? []).map((f) => ({
    family: f.name || f.material || "Unknown",
    inst,
    imageUrl: f.gridfs_id ? assetUrl(f.gridfs_id) : null,
  }));
}

function explodePatterns(inst: Instance): ElementEntry[] {
  const pats = inst.g.patterns ?? [];
  if (pats.length === 0) {
    return [{ family: "Solid", inst, imageUrl: null }];
  }
  return pats.map((p) => ({
    family: p.name || p.type || "Solid",
    inst,
    imageUrl: p.gridfs_id ? assetUrl(p.gridfs_id) : null,
  }));
}

export async function getCategoryOverview(garmentType: string): Promise<CategoryOverview> {
  const byType = await loadInstances();
  const gt = garmentType.toLowerCase();
  const instances = byType.get(gt) ?? [];
  const total = instances.length;

  const colorTable = buildFamilyTable(instances, explodeColors);
  const fabricTable = buildFamilyTable(instances, explodeFabrics);
  const patternTable = buildFamilyTable(instances, explodePatterns);

  const silhouettes = instances
    .filter((inst) => inst.g.flat?.gridfs_id)
    .map((inst) => ({
      look_id: inst.lookId,
      garment_id: inst.garmentId,
      brand: inst.brand,
      piece: inst.piece,
      flat_url: assetUrl(inst.g.flat!.gridfs_id),
    }));

  return {
    garment_type: garmentType,
    total,
    colors: colorTable.slice(0, 10).map((r, i) => buildTrendElement("color", r, total, i)),
    fabrics: fabricTable.slice(0, 8).map((r, i) => buildTrendElement("fabric", r, total, i)),
    patterns: patternTable.slice(0, 8).map((r, i) => buildTrendElement("pattern", r, total, i)),
    silhouettes,
  };
}

export async function getElementTrend(
  kind: "color" | "fabric" | "pattern",
  family: string,
  garmentType: string,
): Promise<TrendElement | null> {
  const byType = await loadInstances();
  const gt = garmentType.toLowerCase();
  const instances = byType.get(gt) ?? [];
  const total = instances.length;
  if (total === 0) return null;

  const explodeFn = kind === "color" ? explodeColors : kind === "fabric" ? explodeFabrics : explodePatterns;
  const table = buildFamilyTable(instances, explodeFn);
  const rank = table.findIndex((r) => r.fam.toLowerCase() === family.toLowerCase());
  if (rank < 0) return null;

  return buildTrendElement(kind, table[rank], total, rank);
}

// Returns trend data for ALL elements in a garment, not just the first
export async function getElementTrendForGarment(
  lookId: string,
  garmentId: string,
): Promise<Record<string, unknown>> {
  const byType = await loadInstances();

  let garmentType: string | null = null;
  let garment: RawGarment | null = null;

  for (const [gt, instances] of byType) {
    const inst = instances.find((i) => i.lookId === lookId && i.garmentId === garmentId);
    if (inst) {
      garmentType = gt;
      garment = inst.g;
      break;
    }
  }

  if (!garmentType || !garment) return {};

  // Look up trends for EVERY color
  const colorTrends: TrendElement[] = [];
  for (const c of garment.colors ?? []) {
    const name = c.name || (c.hex ? colorFamily(c.hex) : null);
    if (name) {
      const t = await getElementTrend("color", name, garmentType);
      if (t) colorTrends.push(t);
    }
  }

  // Look up trends for EVERY fabric
  const fabricTrends: TrendElement[] = [];
  for (const f of garment.fabrics ?? []) {
    const name = f.name || f.material;
    if (name) {
      const t = await getElementTrend("fabric", name, garmentType);
      if (t) fabricTrends.push(t);
    }
  }

  // Look up trends for EVERY pattern
  const patternTrends: TrendElement[] = [];
  const pats = garment.patterns ?? [];
  if (pats.length === 0) {
    const t = await getElementTrend("pattern", "Solid", garmentType);
    if (t) patternTrends.push(t);
  } else {
    for (const p of pats) {
      const name = p.name || p.type;
      if (name) {
        const t = await getElementTrend("pattern", name, garmentType);
        if (t) patternTrends.push(t);
      }
    }
  }

  return {
    garment_type: garmentType,
    colors: colorTrends,
    fabrics: fabricTrends,
    patterns: patternTrends,
  };
}

export async function getAvailableGarmentTypes(): Promise<string[]> {
  const byType = await loadInstances();
  return [...byType.keys()].sort();
}
