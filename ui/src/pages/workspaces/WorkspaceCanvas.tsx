import { useState, useCallback, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Box, Typography, Paper, Button, Chip, Alert,
  IconButton, Skeleton, Tooltip, CircularProgress,
  Accordion, AccordionSummary, AccordionDetails,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Popover, MenuItem, Divider,
} from "@mui/material";
import {
  ReactFlow,
  Background,
  Controls,
  BackgroundVariant,
  type Node,
  type NodeTypes,
  type ReactFlowInstance,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Stage2GarmentConcepts } from "./Stage2GarmentConcepts";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloseIcon from "@mui/icons-material/Close";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import PaletteOutlinedIcon from "@mui/icons-material/PaletteOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import TextureIcon from "@mui/icons-material/Texture";
import BrushOutlinedIcon from "@mui/icons-material/BrushOutlined";
import StyleOutlinedIcon from "@mui/icons-material/StyleOutlined";
import ColorizeOutlinedIcon from "@mui/icons-material/ColorizeOutlined";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import { PaletteStrip } from "../../components/PaletteStrip";
import { CustomUploadDialog } from "./CustomUploadDialog";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api/client";

// ─── Data model ──────────────────────────────────────────────────────────────

interface WorkspaceElement {
  element_id: string;
  look_id?: string;
  garment_id?: string;
  garment_type: string;
  element_type: "color" | "fabric" | "pattern" | "silhouette";
  data: Record<string, unknown>;
  source_brand: string;
  row: string;
  canvas_row?: number | null;
  canvas_position?: { x?: number; y?: number };
  is_custom?: boolean;
}

interface Workspace {
  _id: string;
  id?: string;
  name: string;
  status: "draft" | "ready" | "generating";
  elements: WorkspaceElement[];
  project_id?: string;
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const SLOT_X: Record<string, number> = {
  silhouette: 0,
  color: 210,
  fabric: 410,
  pattern: 610,
};
const NODE_W = 180;
const NODE_H = 140;
const SILHOUETTE_H = 220;
const ROW_HEADER_W = 160;
const CANVAS_OFFSET_X = ROW_HEADER_W + 20;
const ROW_GAP = 40;
const NODE_Y_GAP = 16;

const REQUIRED_TYPES = ["silhouette", "color", "fabric", "pattern"] as const;

const CHIP_COLORS: Record<string, "warning" | "info" | "secondary" | "default" | "success"> = {
  color: "warning",
  fabric: "info",
  pattern: "secondary",
  silhouette: "success",
};

const AI_TOOLS = [
  { label: "Recolour", icon: <PaletteOutlinedIcon fontSize="small" /> },
  { label: "Generate colourways", icon: <AutoAwesomeOutlinedIcon fontSize="small" /> },
  { label: "Suggest fabric pairing", icon: <TextureIcon fontSize="small" /> },
  { label: "Propose a print", icon: <BrushOutlinedIcon fontSize="small" /> },
  { label: "Restyle silhouette", icon: <StyleOutlinedIcon fontSize="small" /> },
  { label: "Complete the palette", icon: <ColorizeOutlinedIcon fontSize="small" /> },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCanvasRowLabel(rowNum: number, elements: WorkspaceElement[]): string {
  const sil = elements.find((e) => e.canvas_row === rowNum && e.element_type === "silhouette");
  if (!sil) return `Row ${rowNum + 1}`;
  const gt = sil.garment_type || "garment";
  return gt.charAt(0).toUpperCase() + gt.slice(1).toLowerCase();
}

// ─── Layout computation (groups by canvas_row, not source row) ────────────────

type RowMeta = { rowNum: number; y: number; height: number; completion: Record<string, boolean> };

function computeSwimLaneLayout(canvasElements: WorkspaceElement[]): {
  positions: Map<string, { x: number; y: number }>;
  rowMeta: RowMeta[];
} {
  const rowNums = [...new Set(canvasElements.map((e) => e.canvas_row!))].sort((a, b) => a - b);

  const positions = new Map<string, { x: number; y: number }>();
  const rowMeta: RowMeta[] = [];
  let currentY = 20;

  for (const rowNum of rowNums) {
    const rowEls = canvasElements.filter((e) => e.canvas_row === rowNum);

    const byType = new Map<string, WorkspaceElement[]>();
    for (const el of rowEls) {
      const list = byType.get(el.element_type) ?? [];
      list.push(el);
      byType.set(el.element_type, list);
    }

    const maxStack = Math.max(...[...byType.values()].map((v) => v.length), 1);
    const stackH = maxStack * NODE_H + (maxStack - 1) * NODE_Y_GAP;
    const rowHeight = Math.max(SILHOUETTE_H, stackH);

    const presentTypes = new Set(rowEls.map((e) => e.element_type));
    const completion: Record<string, boolean> = {};
    for (const t of REQUIRED_TYPES) completion[t] = presentTypes.has(t);

    for (const [type, els] of byType) {
      const baseX = CANVAS_OFFSET_X + (SLOT_X[type] ?? 820);
      const stackTotalH = els.length * NODE_H + (els.length - 1) * NODE_Y_GAP;
      const baseY = currentY + Math.floor((rowHeight - stackTotalH) / 2);
      for (let i = 0; i < els.length; i++) {
        positions.set(els[i].element_id, {
          x: baseX,
          y: baseY + i * (NODE_H + NODE_Y_GAP),
        });
      }
    }

    rowMeta.push({ rowNum, y: currentY, height: rowHeight, completion });
    currentY += rowHeight + ROW_GAP;
  }

  return { positions, rowMeta };
}

// ─── Row header node ──────────────────────────────────────────────────────────

function RowHeaderNode({ data }: {
  data: { label: string; completion: Record<string, boolean>; rowHeight: number };
}) {
  const label = data.label;
  const TYPE_ICONS: Record<string, string> = {
    silhouette: "👗",
    color: "🎨",
    fabric: "🪢",
    pattern: "✦",
  };

  return (
    <Box
      sx={{
        width: ROW_HEADER_W,
        height: data.rowHeight,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 1.5,
        border: "1px solid #e8dedd",
        borderRadius: "12px",
        bgcolor: "#faf8f7",
        px: 1,
      }}
    >
      <Typography
        sx={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          color: "text.secondary",
          textAlign: "center",
        }}
      >
        {label}
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, alignItems: "flex-start" }}>
        {REQUIRED_TYPES.map((t) => (
          <Box
            key={t}
            sx={{ display: "flex", alignItems: "center", gap: 0.75, opacity: data.completion[t] ? 1 : 0.35 }}
          >
            <Box
              sx={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                bgcolor: data.completion[t] ? "primary.main" : "#d4c7c6",
                flexShrink: 0,
              }}
            />
            <Typography sx={{ fontSize: 10, color: "text.secondary", textTransform: "capitalize", lineHeight: 1 }}>
              {TYPE_ICONS[t]} {t}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

// ─── Element node ─────────────────────────────────────────────────────────────

function ElementNode({
  data,
}: {
  data: {
    element: WorkspaceElement;
    onRemoveFromCanvas: (id: string) => void;
    highlighted: boolean;
  };
}) {
  const { element, onRemoveFromCanvas, highlighted } = data;
  const colors = (element.data?.colors as Array<{ hex?: string; name?: string; family?: string }>) ?? [];
  const chipColor = CHIP_COLORS[element.element_type] ?? "default";

  const fabricLabel = (() => {
    const f = element.data?.fabric;
    if (!f) return "Unknown";
    if (typeof f === "string") return f;
    return (f as { name?: string; type?: string }).name ?? (f as { type?: string }).type ?? "Unknown";
  })();

  const fabricImageUrl =
    (element.data?.fabric as { image_url?: string } | undefined)?.image_url ??
    (element.data?.image_url as string | undefined);
  const patternImageUrl = element.data?.image_url as string | undefined;
  const flatUrl = element.data?.flat_url as string | undefined;
  const isSilhouette = element.element_type === "silhouette";
  const nodeH = isSilhouette ? SILHOUETTE_H : NODE_H;

  return (
    <Paper
      sx={{
        width: NODE_W,
        height: nodeH,
        p: 1.5,
        display: "flex",
        flexDirection: "column",
        border: highlighted ? "2px solid" : "1px solid #f0e4e2",
        borderColor: highlighted ? "primary.main" : "#f0e4e2",
        borderRadius: "12px",
        boxShadow: highlighted
          ? "0 0 0 3px rgba(169,53,51,0.15)"
          : "0 2px 12px rgba(36,25,24,0.08)",
        position: "relative",
        cursor: "grab",
        "&:hover .rm-btn": { opacity: 1 },
        "&:active": { cursor: "grabbing" },
        overflow: "hidden",
        transition: "border-color 0.2s, box-shadow 0.2s",
      }}
    >
      <Tooltip title="Remove from canvas">
        <IconButton
          className="rm-btn"
          size="small"
          onMouseDown={(e) => {
            e.stopPropagation();
            onRemoveFromCanvas(element.element_id);
          }}
          sx={{
            position: "absolute",
            top: 5,
            right: 5,
            opacity: 0,
            transition: "opacity 0.15s",
            width: 18,
            height: 18,
            bgcolor: "#fff0ef",
            color: "primary.main",
            zIndex: 10,
            "&:hover": { bgcolor: "#a93533", color: "#fff" },
          }}
        >
          <CloseIcon sx={{ fontSize: 11 }} />
        </IconButton>
      </Tooltip>

      <Chip
        label={element.element_type}
        color={chipColor}
        size="small"
        sx={{
          mb: 1,
          fontSize: 9,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          alignSelf: "flex-start",
          height: 18,
        }}
      />

      <Box sx={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {isSilhouette && flatUrl && (
          <Box
            component="img"
            src={flatUrl}
            alt="Silhouette"
            sx={{ width: "100%", flex: 1, objectFit: "contain", borderRadius: "6px", bgcolor: "#f5f0ef" }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        )}
        {isSilhouette && !flatUrl && (
          <Typography sx={{ fontSize: 11, color: "text.secondary", textAlign: "center", mt: 2 }}>
            No image
          </Typography>
        )}
        {element.element_type === "color" && colors.length > 0 && (
          <>
            <PaletteStrip
              swatches={colors.map((c) => ({ hex: c.hex ?? "#ccc", name: c.name, family: c.family }))}
              size={18}
            />
            <Box sx={{ mt: 0.5 }}>
              {colors.slice(0, 2).map(
                (c, i) =>
                  c.name && (
                    <Typography key={i} sx={{ fontSize: 10, color: "text.secondary", lineHeight: 1.4 }}>
                      {c.name}
                    </Typography>
                  ),
              )}
            </Box>
          </>
        )}
        {element.element_type === "fabric" && (
          <>
            {fabricImageUrl && (
              <Box
                component="img"
                src={fabricImageUrl}
                sx={{ width: "100%", height: 52, objectFit: "cover", borderRadius: "6px", mb: 0.5 }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
            <Typography sx={{ fontSize: 12, fontWeight: 500, color: "text.primary", textTransform: "capitalize", lineHeight: 1.4 }}>
              {fabricLabel}
            </Typography>
          </>
        )}
        {element.element_type === "pattern" && (
          <>
            {patternImageUrl && (
              <Box
                sx={{
                  width: "100%",
                  height: 52,
                  borderRadius: "6px",
                  mb: 0.5,
                  overflow: "hidden",
                  backgroundImage: `url(${patternImageUrl})`,
                  backgroundRepeat: "repeat",
                  backgroundSize: "48px",
                }}
              />
            )}
            <Typography sx={{ fontSize: 12, fontWeight: 500, color: "text.primary", textTransform: "capitalize", lineHeight: 1.4 }}>
              {(element.data?.pattern as string) ?? "—"}
            </Typography>
          </>
        )}
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mt: "auto",
          pt: 0.5,
          borderTop: "1px solid #f0e4e2",
        }}
      >
        <Typography sx={{ fontSize: 10, color: "text.disabled", textTransform: "capitalize" }}>
          {element.source_brand}
        </Typography>
        {element.look_id && (
          <Typography
            component={Link}
            to={`/app/looks/${element.look_id}`}
            onClick={(e) => e.stopPropagation()}
            sx={{ fontSize: 10, color: "primary.main", textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
          >
            source →
          </Typography>
        )}
      </Box>
    </Paper>
  );
}

const NODE_TYPES: NodeTypes = {
  "element-node": ElementNode,
  "row-header": RowHeaderNode,
};

// ─── Build React Flow nodes ───────────────────────────────────────────────────

function buildNodes(
  canvasElements: WorkspaceElement[],
  allElements: WorkspaceElement[],
  onRemoveFromCanvas: (id: string) => void,
  highlightedId: string | null,
): { nodes: Node[]; positions: Map<string, { x: number; y: number }>; rowMeta: RowMeta[] } {
  const { positions, rowMeta } = computeSwimLaneLayout(canvasElements);
  const nodes: Node[] = [];

  for (const rm of rowMeta) {
    const label = getCanvasRowLabel(rm.rowNum, allElements);
    nodes.push({
      id: `row-header-${rm.rowNum}`,
      type: "row-header",
      position: { x: 0, y: rm.y },
      data: { label, completion: rm.completion, rowHeight: rm.height },
      style: { width: ROW_HEADER_W, height: rm.height },
      draggable: false,
      selectable: false,
    });
  }

  for (const el of canvasElements) {
    const pos = positions.get(el.element_id) ?? { x: 0, y: 0 };
    const h = el.element_type === "silhouette" ? SILHOUETTE_H : NODE_H;
    nodes.push({
      id: el.element_id,
      type: "element-node",
      position: pos,
      data: { element: el, onRemoveFromCanvas, highlighted: el.element_id === highlightedId },
      style: { width: NODE_W, height: h },
    });
  }

  return { nodes, positions, rowMeta };
}

// ─── Inventory panel ──────────────────────────────────────────────────────────

function InventoryPanel({
  elements,
  open,
  onToggle,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  canvasRows,
  onClickSilhouette,
  onClickElement,
  onUpload,
}: {
  elements: WorkspaceElement[];
  open: boolean;
  onToggle: () => void;
  canvasRows: Array<{ rowNum: number; label: string }>;
  onClickSilhouette: (elementId: string) => void;
  onClickElement: (elementId: string, anchor: HTMLElement) => void;
  onUpload: () => void;
}) {
  const grouped = useMemo(() => {
    const brands = new Map<string, Map<string, WorkspaceElement[]>>();
    for (const el of elements) {
      const brand = el.source_brand || "Unknown";
      const gt = el.garment_type || "other";
      if (!brands.has(brand)) brands.set(brand, new Map());
      const garments = brands.get(brand)!;
      if (!garments.has(gt)) garments.set(gt, []);
      garments.get(gt)!.push(el);
    }
    return brands;
  }, [elements]);

  const TYPE_ICONS: Record<string, string> = {
    color: "🎨",
    fabric: "🪢",
    pattern: "✦",
    silhouette: "👗",
  };

  function getElementLabel(el: WorkspaceElement): string {
    if (el.element_type === "color") {
      const cols = (el.data?.colors as Array<{ name?: string; hex?: string }>) ?? [];
      return cols.map((c) => c.name ?? c.hex ?? "").filter(Boolean).slice(0, 2).join(", ") || "Color palette";
    }
    if (el.element_type === "fabric") {
      const f = el.data?.fabric;
      if (!f) return "Fabric";
      if (typeof f === "string") return f;
      return (f as { name?: string }).name ?? "Fabric";
    }
    if (el.element_type === "pattern") return (el.data?.pattern as string) || "Pattern";
    if (el.element_type === "silhouette") return "Technical flat";
    return el.element_type;
  }

  return (
    <Box
      sx={{
        width: open ? 264 : 0,
        minWidth: open ? 264 : 0,
        flexShrink: 0,
        overflow: "visible",
        transition: "width 0.2s, min-width 0.2s",
        position: "relative",
        borderRight: open ? "1px solid #f0e4e2" : "none",
        bgcolor: "#faf8f7",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box
        sx={{ position: "absolute", right: -14, top: "50%", transform: "translateY(-50%)", zIndex: 20 }}
      >
        <IconButton
          size="small"
          onClick={onToggle}
          sx={{
            bgcolor: "#fff",
            border: "1px solid #f0e4e2",
            borderRadius: "50%",
            width: 26,
            height: 26,
            boxShadow: "0 2px 8px rgba(36,25,24,0.10)",
            "&:hover": { bgcolor: "#fff0ef" },
          }}
        >
          {open ? <ChevronLeftIcon sx={{ fontSize: 15 }} /> : <ChevronRightIcon sx={{ fontSize: 15 }} />}
        </IconButton>
      </Box>

      <Box sx={{ width: "100%", height: "100%", overflow: "hidden", position: "relative" }}>
        <Box sx={{ width: 264, height: "100%", display: "flex", flexDirection: "column" }}>
          <Box sx={{ px: 2, py: 1.5, borderBottom: "1px solid #f0e4e2", flexShrink: 0, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <Box>
              <Typography sx={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", color: "text.secondary" }}>
                Inventory
              </Typography>
              <Typography sx={{ fontSize: 12, color: "text.disabled", mt: 0.25 }}>
                {elements.length} element{elements.length !== 1 ? "s" : ""} · click to add
              </Typography>
            </Box>
            <Tooltip title="Upload custom elements">
              <IconButton
                size="small"
                onClick={onUpload}
                sx={{ color: "primary.main", "&:hover": { bgcolor: "#fff0ef" }, width: 28, height: 28, mt: 0.25 }}
              >
                <CloudUploadOutlinedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </Box>

          <Box sx={{ flex: 1, overflowY: "auto", py: 0.5 }}>
            {elements.length === 0 ? (
              <Typography sx={{ fontSize: 12, color: "text.disabled", textAlign: "center", mt: 4, px: 2 }}>
                No elements yet. Browse looks to add elements.
              </Typography>
            ) : (
              [...grouped.entries()].map(([brand, garments]) => (
                <Accordion
                  key={brand}
                  defaultExpanded
                  disableGutters
                  elevation={0}
                  sx={{ bgcolor: "transparent", "&:before": { display: "none" } }}
                >
                  <AccordionSummary
                    expandIcon={<ExpandMoreIcon sx={{ fontSize: 13 }} />}
                    sx={{ px: 2, py: 0, minHeight: 34, "& .MuiAccordionSummary-content": { my: 0.5 } }}
                  >
                    <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "capitalize", color: "text.primary", letterSpacing: "0.02em" }}>
                      {brand}
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ px: 1.5, pt: 0, pb: 1 }}>
                    {[...garments.entries()].map(([gt, els]) => (
                      <Box key={gt} sx={{ mb: 1 }}>
                        <Typography sx={{ fontSize: 10, fontWeight: 600, textTransform: "capitalize", color: "text.disabled", mb: 0.5, px: 0.5 }}>
                          {gt}
                        </Typography>
                        {els.map((el) => {
                          const isSil = el.element_type === "silhouette";
                          const isAssigned = el.canvas_row != null;
                          return (
                            <Box
                              key={el.element_id}
                              onClick={(e) => {
                                if (isSil) {
                                  onClickSilhouette(el.element_id);
                                } else {
                                  onClickElement(el.element_id, e.currentTarget as HTMLElement);
                                }
                              }}
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                                px: 1,
                                py: 0.6,
                                borderRadius: "7px",
                                cursor: "pointer",
                                "&:hover": { bgcolor: "#fff0ef" },
                                transition: "background 0.1s",
                                opacity: isSil && isAssigned ? 0.5 : 1,
                              }}
                            >
                              <Typography sx={{ fontSize: 12, lineHeight: 1, flexShrink: 0 }}>
                                {TYPE_ICONS[el.element_type] ?? "•"}
                              </Typography>
                              <Typography
                                sx={{
                                  fontSize: 12,
                                  color: "text.secondary",
                                  flex: 1,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {getElementLabel(el)}
                              </Typography>
                              {isAssigned && (
                                <Chip
                                  label={`R${el.canvas_row! + 1}`}
                                  size="small"
                                  sx={{
                                    fontSize: 9,
                                    height: 16,
                                    bgcolor: "#fff0ef",
                                    color: "primary.main",
                                    fontWeight: 700,
                                    flexShrink: 0,
                                    "& .MuiChip-label": { px: 0.75 },
                                  }}
                                />
                              )}
                              {!isAssigned && isSil && (
                                <Typography sx={{ fontSize: 9, color: "text.disabled", flexShrink: 0 }}>
                                  + new row
                                </Typography>
                              )}
                            </Box>
                          );
                        })}
                      </Box>
                    ))}
                  </AccordionDetails>
                </Accordion>
              ))
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WorkspaceCanvas() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { activeProject } = useAuth();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [stage, setStage] = useState<1 | 2>(1);

  // Row picker popover state
  const [pendingAssign, setPendingAssign] = useState<{ elementId: string; anchor: HTMLElement } | null>(null);

  const { data: ws, isLoading } = useQuery<Workspace>({
    queryKey: ["workspace", id],
    queryFn: async () => {
      const { data } = await api.get(`/workspace/${id}`);
      return data;
    },
    enabled: !!id,
    refetchInterval: (query) => (query.state.data?.status === "generating" ? 5000 : false),
  });

  // Assign an element to a canvas row (or null to remove from canvas)
  const assignToCanvas = useMutation({
    mutationFn: async ({ elementId, canvasRow }: { elementId: string; canvasRow: number | null }) => {
      const updated = ws!.elements.map((e) =>
        e.element_id === elementId ? { ...e, canvas_row: canvasRow } : e,
      );
      await api.put(`/workspace/${id}/elements`, { elements: updated });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspace", id] }),
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const removeEl = useMutation({
    mutationFn: async (elementId: string) => {
      await api.delete(`/workspace/${id}/elements/${elementId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspace", id] }),
  });

  const savePositions = useCallback(
    async (elements: WorkspaceElement[]) => {
      try {
        await api.put(`/workspace/${id}/elements`, { elements });
      } catch { /* best-effort */ }
    },
    [id],
  );

  const [prevStatus, setPrevStatus] = useState(ws?.status);

  useEffect(() => {
    if (prevStatus === "generating" && ws?.status === "ready") {
      setStage(2);
    }
    setPrevStatus(ws?.status);
  }, [ws?.status, prevStatus]);

  const generate = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/workspace/${id}/generate`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace", id] });
      qc.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });

  // Canvas elements = only those with canvas_row assigned
  const canvasElements = useMemo(
    () => ws?.elements.filter((e) => e.canvas_row != null) ?? [],
    [ws],
  );

  // Next available row number
  const nextRowNum = useMemo(
    () => ws?.elements.reduce((max, e) => (e.canvas_row != null ? Math.max(max, e.canvas_row + 1) : max), 0) ?? 0,
    [ws],
  );

  // Available canvas rows (for picker)
  const canvasRows = useMemo(() => {
    if (!ws) return [];
    const rowNums = [...new Set(ws.elements.filter((e) => e.canvas_row != null).map((e) => e.canvas_row!))].sort(
      (a, b) => a - b,
    );
    return rowNums.map((rowNum) => ({
      rowNum,
      label: getCanvasRowLabel(rowNum, ws.elements),
    }));
  }, [ws]);

  // Completion gating based on canvas rows
  const completionByRow = useMemo(() => {
    if (!ws) return [];
    return canvasRows.map(({ rowNum }) => {
      const rowEls = ws.elements.filter((e) => e.canvas_row === rowNum);
      const present = new Set(rowEls.map((e) => e.element_type));
      return { rowNum, complete: REQUIRED_TYPES.every((t) => present.has(t)) };
    });
  }, [ws, canvasRows]);

  const anyRowComplete = completionByRow.some((r) => r.complete);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [, , onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    if (!ws) return;
    const { nodes: built } = buildNodes(
      canvasElements,
      ws.elements,
      (eid) => assignToCanvas.mutate({ elementId: eid, canvasRow: null }),
      highlightedId,
    );
    setNodes(built);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, highlightedId]);

  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) =>
        n.type === "element-node"
          ? { ...n, data: { ...n.data, highlighted: n.id === highlightedId } }
          : n,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightedId]);

  const onNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, _node: Node, draggedNodes: Node[]) => {
      if (!ws) return;
      const elementNodes = draggedNodes.filter((n) => n.type === "element-node");
      if (elementNodes.length === 0) return;
      const posMap = new Map(elementNodes.map((n) => [n.id, n.position]));
      const updated = ws.elements.map((el) => ({
        ...el,
        canvas_position: posMap.has(el.element_id)
          ? { x: posMap.get(el.element_id)!.x, y: posMap.get(el.element_id)!.y }
          : (el.canvas_position ?? { x: 0, y: 0 }),
      }));
      savePositions(updated);
    },
    [ws, savePositions],
  );

  function handleClickSilhouette(elementId: string) {
    // Check if this silhouette is already on canvas
    const el = ws?.elements.find((e) => e.element_id === elementId);
    if (!el || el.canvas_row != null) return; // already placed
    assignToCanvas.mutate({ elementId, canvasRow: nextRowNum });
  }

  function handleClickElement(elementId: string, anchor: HTMLElement) {
    setPendingAssign({ elementId, anchor });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function focusNode(elementId: string) {
    const el = canvasElements.find((e) => e.element_id === elementId);
    if (!el || !rfInstance) return;
    const { positions } = computeSwimLaneLayout(canvasElements);
    const pos = positions.get(elementId);
    if (!pos) return;
    setHighlightedId(elementId);
    rfInstance.setCenter(pos.x + NODE_W / 2, pos.y + NODE_H / 2, { zoom: 1.4, duration: 500 });
    setTimeout(() => setHighlightedId(null), 2000);
  }

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="text" width={120} height={32} sx={{ mb: 4 }} />
        <Skeleton variant="rectangular" height={560} sx={{ borderRadius: 2, mb: 2 }} />
      </Box>
    );
  }

  if (!ws) return <Alert severity="error">Workspace not found.</Alert>;

  const isGenerating = ws.status === "generating";

  return (
    <Box sx={{ overflow: "hidden", width: "100%" }}>
      <Box sx={{ 
        display: "flex", 
        alignItems: "flex-start",
        width: "200%", 
        transform: stage === 1 ? "translateX(0)" : "translateX(-50%)", 
        transition: "transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)" 
      }}>
        {/* ================= STAGE 1 ================= */}
        <Box sx={{ 
          width: "50%", 
          flexShrink: 0, 
          pr: stage === 1 ? 0 : 4, 
          transition: "padding 0.6s", 
          display: "flex", 
          flexDirection: "column",
          height: stage === 1 ? "auto" : 0,
          overflow: stage === 1 ? "visible" : "hidden"
        }}>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 3 }}>
        <Box>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => nav(`/app/workspace/${id}`)}
            sx={{ color: "text.secondary", mb: 1.5, fontWeight: 500, "&:hover": { color: "primary.main" } }}
          >
            Back to Workspace
          </Button>
          {activeProject && (
            <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "primary.main", mb: 0.5 }}>
              {activeProject.name}
            </Typography>
          )}
          <Typography sx={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", color: "text.primary" }}>
            {ws.name}
          </Typography>
          <Typography sx={{ color: "text.secondary", fontSize: 14, mt: 0.5 }}>
            {ws.elements.length} element{ws.elements.length !== 1 ? "s" : ""}
            {anyRowComplete && (
              <Box component="span" sx={{ color: "success.main", ml: 1 }}>· Ready to generate</Box>
            )}
            {canvasElements.length > 0 && !anyRowComplete && (
              <Box component="span" sx={{ color: "text.disabled", ml: 1 }}>· Complete a row to generate</Box>
            )}
            {canvasElements.length === 0 && ws.elements.length > 0 && (
              <Box component="span" sx={{ color: "text.disabled", ml: 1 }}>· Start by adding a silhouette</Box>
            )}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 2 }}>
          <Tooltip
            title={!anyRowComplete ? "Complete a row (silhouette + colour + fabric + pattern) to unlock" : ""}
          >
            <span>
              <Button
                variant="contained"
                startIcon={<AutoAwesomeIcon />}
                disabled={isGenerating || generate.isPending || !anyRowComplete}
                onClick={() => generate.mutate()}
                sx={{ mt: 1, borderRadius: "10px", py: 1.5, px: 3 }}
              >
                {isGenerating ? "Generating…" : "Generate Collection"}
              </Button>
            </span>
          </Tooltip>
          {ws.status === "ready" && (
            <Button
              variant="outlined"
              onClick={() => setStage(2)}
              sx={{ mt: 1, borderRadius: "10px", py: 1.5, px: 3, borderColor: "primary.main", color: "primary.main", "&:hover": { bgcolor: "#fff0ef" } }}
            >
              View Concepts
            </Button>
          )}
        </Box>
      </Box>

      {isGenerating && (
        <Alert severity="info" sx={{ mb: 3, borderRadius: "12px", border: "1px solid #e3f2fd" }}>
          Your collection is being generated. This may take a few minutes.
        </Alert>
      )}

      {/* Canvas + Inventory */}
      <Paper
        sx={{
          border: "1px solid #f0e4e2",
          borderRadius: "16px",
          overflow: "hidden",
          height: 580,
          mb: 4,
          display: "flex",
          position: "relative",
        }}
      >
        <InventoryPanel
          elements={ws.elements}
          open={sidebarOpen}
          onToggle={() => setSidebarOpen((v) => !v)}
          canvasRows={canvasRows}
          onClickSilhouette={handleClickSilhouette}
          onClickElement={handleClickElement}
          onUpload={() => setUploadOpen(true)}
        />

        <Box sx={{ flex: 1, position: "relative" }}>
          {ws.elements.length === 0 ? (
            <Box
              sx={{
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                gap: 1,
                bgcolor: "#faf8f7",
              }}
            >
              <Typography sx={{ color: "text.secondary", fontFamily: "'Literata', Georgia, serif", fontSize: 18, mb: 0.5 }}>
                No elements yet
              </Typography>
              <Typography sx={{ color: "text.disabled", fontSize: 14, mb: 2 }}>
                Browse looks and add silhouette, colour, fabric, or pattern elements.
              </Typography>
              <Button
                variant="outlined"
                startIcon={<SearchOutlinedIcon />}
                onClick={() => nav("/app/looks")}
                sx={{ borderColor: "#f0e4e2", color: "text.secondary", borderRadius: "10px", "&:hover": { borderColor: "#dfbfbc", bgcolor: "#fff0ef" } }}
              >
                Browse Looks
              </Button>
            </Box>
          ) : canvasElements.length === 0 ? (
            <Box
              sx={{
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                gap: 1,
                bgcolor: "#faf8f7",
              }}
            >
              <Typography sx={{ fontSize: 32, mb: 0.5 }}>👗</Typography>
              <Typography sx={{ color: "text.secondary", fontFamily: "'Literata', Georgia, serif", fontSize: 18, mb: 0.5 }}>
                Canvas is empty
              </Typography>
              <Typography sx={{ color: "text.disabled", fontSize: 14, textAlign: "center", maxWidth: 320 }}>
                Click a silhouette in the inventory to start your first garment row. Then mix in fabrics, patterns, and colours from any source.
              </Typography>
            </Box>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={[]}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeDragStop={onNodeDragStop}
              nodeTypes={NODE_TYPES}
              onInit={(instance) => setRfInstance(instance as unknown as ReactFlowInstance)}
              fitView
              fitViewOptions={{ padding: 0.3 }}
              proOptions={{ hideAttribution: true }}
              style={{ background: "#faf8f7" }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="#e8dedd" />
              <Controls style={{ border: "1px solid #f0e4e2", borderRadius: 8, overflow: "hidden" }} />
            </ReactFlow>
          )}
        </Box>
      </Paper>

      {/* Row picker popover */}
      <Popover
        open={!!pendingAssign}
        anchorEl={pendingAssign?.anchor}
        onClose={() => setPendingAssign(null)}
        anchorOrigin={{ vertical: "center", horizontal: "right" }}
        transformOrigin={{ vertical: "center", horizontal: "left" }}
        PaperProps={{
          sx: {
            borderRadius: "10px",
            border: "1px solid #f0e4e2",
            minWidth: 180,
            boxShadow: "0 4px 20px rgba(36,25,24,0.10)",
          },
        }}
      >
        <Box sx={{ p: 1.5 }}>
          <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.disabled", mb: 1 }}>
            Add to row
          </Typography>
          {canvasRows.length === 0 ? (
            <Typography sx={{ fontSize: 12, color: "text.secondary", px: 0.5 }}>
              Add a silhouette first to start a row
            </Typography>
          ) : (
            canvasRows.map(({ rowNum, label }) => (
              <MenuItem
                key={rowNum}
                dense
                onClick={() => {
                  if (pendingAssign) {
                    assignToCanvas.mutate({ elementId: pendingAssign.elementId, canvasRow: rowNum });
                  }
                  setPendingAssign(null);
                }}
                sx={{ borderRadius: "6px", fontSize: 13, px: 1.25 }}
              >
                Row {rowNum + 1} — {label}
              </MenuItem>
            ))
          )}
        </Box>
      </Popover>

      <CustomUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        workspaceId={id!}
      />

      {/* AI Studio */}
      <Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "text.secondary" }}>
            AI Studio
          </Typography>
          <Box sx={{ flex: 1, height: 1, bgcolor: "#f0e4e2" }} />
        </Box>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5 }}>
          {AI_TOOLS.map((tool) => (
            <Button
              key={tool.label}
              variant="outlined"
              startIcon={isGenerating ? <CircularProgress size={14} /> : tool.icon}
              disabled={isGenerating || generate.isPending || !anyRowComplete}
              onClick={() => generate.mutate()}
              sx={{
                borderColor: "#f0e4e2",
                color: "text.secondary",
                borderRadius: "10px",
                fontSize: 13,
                py: 1,
                px: 2,
                "&:hover": { borderColor: "primary.main", color: "primary.main", bgcolor: "#fff0ef" },
              }}
            >
              {tool.label}
            </Button>
          ))}
        </Box>
        </Box>
      </Box>

      {/* ================= STAGE 2 ================= */}
        <Box sx={{ 
          width: "50%", 
          flexShrink: 0, 
          pl: stage === 2 ? 0 : 4, 
          transition: "padding 0.6s",
          height: stage === 2 ? "auto" : 0,
          overflow: stage === 2 ? "visible" : "hidden"
        }}>
          <Box sx={{ mb: 3 }}>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={() => setStage(1)}
              sx={{ color: "text.secondary", fontSize: 13, "&:hover": { bgcolor: "transparent", color: "primary.main" } }}
            >
              Back to Canvas
            </Button>
          </Box>
          <Stage2GarmentConcepts workspaceId={id} ws={ws} />
        </Box>
      </Box>
    </Box>
  );
}
