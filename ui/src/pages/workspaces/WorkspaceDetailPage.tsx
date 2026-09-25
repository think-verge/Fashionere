import { useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Box, Typography, Button, Chip, Alert,
  IconButton, Skeleton, Tooltip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Checkbox, Select, MenuItem, Paper,
  ToggleButton, ToggleButtonGroup,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import TableRowsOutlinedIcon from "@mui/icons-material/TableRowsOutlined";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { PaletteStrip } from "../../components/PaletteStrip";
import { CustomUploadDialog } from "./CustomUploadDialog";
import { Stage2GarmentConcepts } from "./Stage2GarmentConcepts";
import { api } from "../../lib/api/client";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  name: string;
  status: "draft" | "ready" | "generating";
  elements: WorkspaceElement[];
  createdAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, string> = {
  color: "🎨",
  fabric: "🪢",
  pattern: "✦",
  silhouette: "👗",
};

const TYPE_CHIP_COLOR: Record<string, "warning" | "info" | "secondary" | "default" | "success"> = {
  color: "warning",
  fabric: "info",
  pattern: "secondary",
  silhouette: "success",
};

const GARMENT_OPTIONS = [
  "Jacket", "Coat", "Dress", "Trousers", "Skirt", "Top",
  "Shirt", "Knitwear", "Accessories", "Shoes", "Bag", "custom",
];

const STATUS_COLOR: Record<string, "default" | "success" | "warning"> = {
  draft: "default",
  ready: "success",
  generating: "warning",
};

const REQUIRED_TYPES = ["silhouette", "color", "fabric", "pattern"] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getElementLabel(el: WorkspaceElement): string {
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
    default:
      return el.element_type;
  }
}

function getPreviewUrl(el: WorkspaceElement): string | null {
  if (el.element_type === "silhouette") return (el.data?.flat_url as string) ?? null;
  if (el.element_type === "fabric") return (el.data?.fabric as { image_url?: string } | undefined)?.image_url ?? (el.data?.image_url as string) ?? null;
  if (el.element_type === "pattern") return (el.data?.image_url as string) ?? null;
  return null;
}

function getColors(el: WorkspaceElement) {
  return (el.data?.colors as Array<{ hex?: string; name?: string; family?: string }> | undefined) ?? [];
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WorkspaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"flat" | "grouped">("grouped");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editingGarmentId, setEditingGarmentId] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: ws, isLoading, error } = useQuery<Workspace>({
    queryKey: ["workspace", id],
    queryFn: async () => {
      const { data } = await api.get(`/workspace/${id}`);
      return data;
    },
    enabled: !!id,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const deleteElement = useMutation({
    mutationFn: async (elementId: string) => {
      await api.delete(`/workspace/${id}/elements/${elementId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspace", id] }),
  });

  const updateElements = useMutation({
    mutationFn: async (elements: WorkspaceElement[]) => {
      const { data } = await api.put(`/workspace/${id}/elements`, { elements });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace", id] });
      setEditingGarmentId(null);
    },
  });

  // ── Derived data ───────────────────────────────────────────────────────────

  const elements = useMemo(() => ws?.elements ?? [], [ws?.elements]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { silhouette: 0, fabric: 0, pattern: 0, color: 0 };
    elements.forEach((el) => { counts[el.element_type] = (counts[el.element_type] ?? 0) + 1; });
    return counts;
  }, [elements]);

  const grouped = useMemo(() => {
    const map = new Map<string, WorkspaceElement[]>();
    elements.forEach((el) => {
      const key = el.garment_type || "custom";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(el);
    });
    return map;
  }, [elements]);

  const completeRows = useMemo(() => {
    let count = 0;
    grouped.forEach((els) => {
      const types = new Set(els.map((e) => e.element_type));
      if (REQUIRED_TYPES.every((t) => types.has(t))) count++;
    });
    return count;
  }, [grouped]);

  // ── Selection helpers ─────────────────────────────────────────────────────

  const allSelected = elements.length > 0 && selected.size === elements.length;
  const someSelected = selected.size > 0 && !allSelected;

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(elements.map((e) => e.element_id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleBulkDelete() {
    const ids = Array.from(selected);
    setDeletingIds(new Set(ids));
    const remaining = elements.filter((e) => !selected.has(e.element_id));
    await updateElements.mutateAsync(remaining);
    setSelected(new Set());
    setDeletingIds(new Set());
  }

  async function handleSingleDelete(elementId: string) {
    setDeletingIds((prev) => new Set([...prev, elementId]));
    await deleteElement.mutateAsync(elementId);
    setDeletingIds((prev) => { const n = new Set(prev); n.delete(elementId); return n; });
    setSelected((prev) => { const n = new Set(prev); n.delete(elementId); return n; });
  }

  function handleGarmentTypeChange(elementId: string, newType: string) {
    if (!ws) return;
    const updated = ws.elements.map((el) =>
      el.element_id === elementId ? { ...el, garment_type: newType, row: newType } : el
    );
    updateElements.mutate(updated);
  }

  // ── Loading / error states ─────────────────────────────────────────────────

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="text" width={240} height={40} sx={{ mb: 1 }} />
        <Skeleton variant="rectangular" height={400} sx={{ borderRadius: "12px" }} />
      </Box>
    );
  }

  if (error || !ws) {
    return <Alert severity="error">Failed to load workspace.</Alert>;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 3, gap: 2 }}>
        <Box>
          <Button
            startIcon={<ArrowBackIcon />}
            component={Link}
            to="/app/workspaces"
            sx={{ color: "text.secondary", fontSize: 13, mb: 1.5, px: 0, "&:hover": { bgcolor: "transparent", color: "primary.main" } }}
          >
            All Workspaces
          </Button>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.75 }}>
            <Typography sx={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", color: "text.primary" }}>
              {ws.name}
            </Typography>
            <Chip
              label={ws.status}
              color={STATUS_COLOR[ws.status] ?? "default"}
              size="small"
              variant="outlined"
              sx={{ fontSize: 10, textTransform: "capitalize", height: 22 }}
            />
          </Box>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            {elements.length} element{elements.length !== 1 ? "s" : ""}
            {completeRows > 0 && ` · ${completeRows} complete row${completeRows !== 1 ? "s" : ""}`}
          </Typography>
        </Box>
        <Button
          variant="contained"
          endIcon={<AutoAwesomeOutlinedIcon />}
          onClick={() => navigate(`/app/workspace/${id}/builder`)}
          sx={{ borderRadius: "10px", px: 2.5, py: 1.25, flexShrink: 0, mt: 4 }}
        >
          Open AI Builder
        </Button>
      </Box>

      {/* Stats bar */}
      {elements.length > 0 && (
        <Box sx={{ display: "flex", gap: 1.5, mb: 3, flexWrap: "wrap" }}>
          {(["silhouette", "fabric", "pattern", "color"] as const).map((type) => (
            <Box
              key={type}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.75,
                bgcolor: "#faf8f7",
                border: "1px solid #f0e4e2",
                borderRadius: "8px",
                px: 1.5,
                py: 0.75,
              }}
            >
              <Typography sx={{ fontSize: 14 }}>{TYPE_ICONS[type]}</Typography>
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.primary" }}>
                {typeCounts[type]}
              </Typography>
              <Typography sx={{ fontSize: 12, color: "text.secondary", textTransform: "capitalize" }}>
                {type}{typeCounts[type] !== 1 ? "s" : ""}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      {/* Toolbar */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={(_e, v) => v && setViewMode(v)}
          size="small"
          sx={{ "& .MuiToggleButton-root": { border: "1px solid #f0e4e2", borderRadius: "8px !important", px: 1.5, py: 0.5 } }}
        >
          <ToggleButton value="grouped">
            <Tooltip title="Group by garment type">
              <AccountTreeOutlinedIcon sx={{ fontSize: 16 }} />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="flat">
            <Tooltip title="Flat list">
              <TableRowsOutlinedIcon sx={{ fontSize: 16 }} />
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

        <Button
          startIcon={<CloudUploadOutlinedIcon />}
          size="small"
          onClick={() => setUploadOpen(true)}
          sx={{ borderRadius: "8px", border: "1px solid #f0e4e2", color: "text.secondary", fontSize: 13, "&:hover": { borderColor: "primary.main", color: "primary.main", bgcolor: "#fff0ef" } }}
        >
          Upload custom
        </Button>

        {selected.size > 0 && (
          <Button
            startIcon={<DeleteOutlineIcon />}
            size="small"
            color="error"
            variant="outlined"
            onClick={handleBulkDelete}
            disabled={updateElements.isPending}
            sx={{ borderRadius: "8px", fontSize: 13, ml: "auto" }}
          >
            Delete selected ({selected.size})
          </Button>
        )}
      </Box>

      {/* Empty state */}
      {elements.length === 0 && (
        <Box sx={{ textAlign: "center", py: 12, border: "1px dashed #f0e4e2", borderRadius: "12px" }}>
          <Typography sx={{ fontSize: 40, mb: 2 }}>🪣</Typography>
          <Typography sx={{ color: "text.secondary", fontWeight: 500, mb: 1 }}>No elements yet</Typography>
          <Typography sx={{ color: "text.disabled", fontSize: 14, mb: 3 }}>
            Add elements from looks or upload your own custom designs.
          </Typography>
          <Button
            variant="contained"
            startIcon={<CloudUploadOutlinedIcon />}
            onClick={() => setUploadOpen(true)}
            sx={{ borderRadius: "10px" }}
          >
            Upload custom
          </Button>
        </Box>
      )}

      {/* Table — flat mode */}
      {elements.length > 0 && viewMode === "flat" && (
        <ElementTable
          elements={elements}
          selected={selected}
          allSelected={allSelected}
          someSelected={someSelected}
          deletingIds={deletingIds}
          editingGarmentId={editingGarmentId}
          onToggleAll={toggleAll}
          onToggleOne={toggleOne}
          onDelete={handleSingleDelete}
          onEditGarmentStart={setEditingGarmentId}
          onGarmentChange={handleGarmentTypeChange}
          updatePending={updateElements.isPending}
        />
      )}

      {/* Table — grouped mode */}
      {elements.length > 0 && viewMode === "grouped" && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {Array.from(grouped.entries()).map(([garmentType, els]) => {
            const types = new Set(els.map((e) => e.element_type));
            const isComplete = REQUIRED_TYPES.every((t) => types.has(t));
            return (
              <Box key={garmentType}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", color: "text.secondary" }}>
                    {garmentType}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
                    {els.length} element{els.length !== 1 ? "s" : ""}
                  </Typography>
                  {isComplete && (
                    <Chip
                      icon={<CheckCircleOutlineIcon sx={{ fontSize: "14px !important" }} />}
                      label="Complete"
                      color="success"
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: 10, height: 20, "& .MuiChip-label": { px: 0.75 } }}
                    />
                  )}
                  <Box sx={{ flex: 1, height: 1, bgcolor: "#f0e4e2" }} />
                </Box>
                <ElementTable
                  elements={els}
                  selected={selected}
                  allSelected={els.every((e) => selected.has(e.element_id))}
                  someSelected={els.some((e) => selected.has(e.element_id)) && !els.every((e) => selected.has(e.element_id))}
                  deletingIds={deletingIds}
                  editingGarmentId={editingGarmentId}
                  onToggleAll={() => {
                    const groupIds = new Set(els.map((e) => e.element_id));
                    const allGroupSelected = els.every((e) => selected.has(e.element_id));
                    setSelected((prev) => {
                      const next = new Set(prev);
                      groupIds.forEach((id) => allGroupSelected ? next.delete(id) : next.add(id));
                      return next;
                    });
                  }}
                  onToggleOne={toggleOne}
                  onDelete={handleSingleDelete}
                  onEditGarmentStart={setEditingGarmentId}
                  onGarmentChange={handleGarmentTypeChange}
                  updatePending={updateElements.isPending}
                  hideGroupColumn
                />
              </Box>
            );
          })}
        </Box>
      )}

      {/* Open AI Builder CTA at bottom (when there are elements) */}
      {elements.length > 0 && (
        <Box
          sx={{
            mt: 4,
            p: 3,
            border: "1px solid #f0e4e2",
            borderRadius: "12px",
            bgcolor: "#faf8f7",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
          }}
        >
          <Box>
            <Typography sx={{ fontWeight: 600, fontSize: 15, mb: 0.5 }}>
              Ready to generate?
            </Typography>
            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
              Open the AI Builder to arrange elements on the canvas and generate your collection.
            </Typography>
          </Box>
          <Button
            variant="contained"
            endIcon={<ArrowForwardIcon />}
            onClick={() => navigate(`/app/workspace/${id}/builder`)}
            sx={{ borderRadius: "10px", px: 2.5, py: 1.25, flexShrink: 0 }}
          >
            Open AI Builder
          </Button>
        </Box>
      )}

      <CustomUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        workspaceId={id!}
      />

      {/* Stage 2 Mock Section */}
      <Stage2GarmentConcepts />
    </Box>
  );
}

// ─── Element table sub-component ──────────────────────────────────────────────

function ElementTable({
  elements,
  selected,
  allSelected,
  someSelected,
  deletingIds,
  editingGarmentId,
  onToggleAll,
  onToggleOne,
  onDelete,
  onEditGarmentStart,
  onGarmentChange,
  updatePending,
  hideGroupColumn = false,
}: {
  elements: WorkspaceElement[];
  selected: Set<string>;
  allSelected: boolean;
  someSelected: boolean;
  deletingIds: Set<string>;
  editingGarmentId: string | null;
  onToggleAll: () => void;
  onToggleOne: (id: string) => void;
  onDelete: (id: string) => void;
  onEditGarmentStart: (id: string | null) => void;
  onGarmentChange: (elementId: string, newType: string) => void;
  updatePending: boolean;
  hideGroupColumn?: boolean;
}) {
  return (
    <TableContainer
      component={Paper}
      variant="outlined"
      sx={{ borderRadius: "12px", border: "1px solid #f0e4e2" }}
    >
      <Table size="small">
        <TableHead>
          <TableRow sx={{ bgcolor: "#faf8f7" }}>
            <TableCell padding="checkbox" sx={{ borderColor: "#f0e4e2", pl: 2 }}>
              <Checkbox
                size="small"
                checked={allSelected}
                indeterminate={someSelected}
                onChange={onToggleAll}
              />
            </TableCell>
            <TableCell sx={{ borderColor: "#f0e4e2", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", width: 56 }}>
              Preview
            </TableCell>
            <TableCell sx={{ borderColor: "#f0e4e2", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary" }}>
              Type
            </TableCell>
            <TableCell sx={{ borderColor: "#f0e4e2", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary" }}>
              Name
            </TableCell>
            {!hideGroupColumn && (
              <TableCell sx={{ borderColor: "#f0e4e2", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary" }}>
                Garment
              </TableCell>
            )}
            <TableCell sx={{ borderColor: "#f0e4e2", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary" }}>
              Source
            </TableCell>
            <TableCell sx={{ borderColor: "#f0e4e2", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", width: 80 }}>
              Canvas
            </TableCell>
            <TableCell sx={{ borderColor: "#f0e4e2", width: 48 }} />
          </TableRow>
        </TableHead>
        <TableBody>
          {elements.map((el) => {
            const previewUrl = getPreviewUrl(el);
            const colors = getColors(el);
            const label = getElementLabel(el);
            const isDeleting = deletingIds.has(el.element_id);
            const isEditingGarment = editingGarmentId === el.element_id;

            return (
              <TableRow
                key={el.element_id}
                sx={{
                  opacity: isDeleting ? 0.4 : 1,
                  transition: "opacity 0.15s",
                  "&:last-child td": { border: 0 },
                  "& td": { borderColor: "#f0e4e2" },
                  bgcolor: selected.has(el.element_id) ? "#fff8f7" : "transparent",
                  "&:hover": { bgcolor: selected.has(el.element_id) ? "#fff0ef" : "#faf8f7" },
                  "&:hover .el-delete-btn": { opacity: 1 },
                }}
              >
                {/* Checkbox */}
                <TableCell padding="checkbox" sx={{ pl: 2 }}>
                  <Checkbox
                    size="small"
                    checked={selected.has(el.element_id)}
                    onChange={() => onToggleOne(el.element_id)}
                  />
                </TableCell>

                {/* Preview */}
                <TableCell sx={{ py: 1 }}>
                  <Box sx={{ width: 40, height: 40, borderRadius: "8px", overflow: "hidden", bgcolor: "#f5f0ef", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {el.element_type === "color" && colors.length > 0 ? (
                      <PaletteStrip swatches={colors.map((c) => ({ hex: c.hex ?? "#ccc", name: c.name, family: c.family }))} size={14} />
                    ) : previewUrl ? (
                      <Box
                        component="img"
                        src={previewUrl}
                        alt={label}
                        sx={{ width: "100%", height: "100%", objectFit: "cover" }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <Typography sx={{ fontSize: 18 }}>{TYPE_ICONS[el.element_type]}</Typography>
                    )}
                  </Box>
                </TableCell>

                {/* Type chip */}
                <TableCell sx={{ py: 1 }}>
                  <Chip
                    label={el.element_type}
                    color={TYPE_CHIP_COLOR[el.element_type] ?? "default"}
                    size="small"
                    sx={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", height: 20 }}
                  />
                </TableCell>

                {/* Name */}
                <TableCell sx={{ py: 1, maxWidth: 200 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 500, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {label}
                  </Typography>
                </TableCell>

                {/* Garment type (editable, hidden in grouped mode) */}
                {!hideGroupColumn && (
                  <TableCell sx={{ py: 1 }}>
                    {isEditingGarment ? (
                      <Select
                        value={el.garment_type || "custom"}
                        size="small"
                        autoFocus
                        open
                        onClose={() => onEditGarmentStart(null)}
                        onChange={(e) => { onGarmentChange(el.element_id, e.target.value); }}
                        disabled={updatePending}
                        sx={{ fontSize: 12, "& .MuiOutlinedInput-notchedOutline": { borderColor: "primary.main" }, minWidth: 110 }}
                      >
                        {GARMENT_OPTIONS.map((opt) => (
                          <MenuItem key={opt} value={opt.toLowerCase()} sx={{ fontSize: 13 }}>
                            {opt}
                          </MenuItem>
                        ))}
                      </Select>
                    ) : (
                      <Tooltip title="Click to edit garment type">
                        <Box
                          onClick={() => onEditGarmentStart(el.element_id)}
                          sx={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 0.5,
                            px: 1,
                            py: 0.25,
                            borderRadius: "6px",
                            cursor: "pointer",
                            border: "1px solid transparent",
                            "&:hover": { border: "1px solid #f0e4e2", bgcolor: "#fff0ef" },
                          }}
                        >
                          <Typography sx={{ fontSize: 12, color: "text.secondary", textTransform: "capitalize" }}>
                            {el.garment_type || "custom"}
                          </Typography>
                          <Typography sx={{ fontSize: 10, color: "text.disabled" }}>▾</Typography>
                        </Box>
                      </Tooltip>
                    )}
                  </TableCell>
                )}

                {/* Source */}
                <TableCell sx={{ py: 1 }}>
                  {el.is_custom ? (
                    <Chip label="Custom" size="small" variant="outlined" sx={{ fontSize: 10, height: 20, borderColor: "#f0e4e2", color: "text.secondary" }} />
                  ) : (
                    <Typography sx={{ fontSize: 12, color: "text.secondary", textTransform: "capitalize" }}>
                      {el.source_brand || "—"}
                    </Typography>
                  )}
                </TableCell>

                {/* Canvas row */}
                <TableCell sx={{ py: 1 }}>
                  {el.canvas_row != null ? (
                    <Chip
                      label={`Row ${el.canvas_row + 1}`}
                      size="small"
                      sx={{ fontSize: 10, height: 20, bgcolor: "#fff0ef", color: "primary.main", fontWeight: 600, border: "none" }}
                    />
                  ) : (
                    <Typography sx={{ fontSize: 11, color: "text.disabled" }}>—</Typography>
                  )}
                </TableCell>

                {/* Delete */}
                <TableCell sx={{ py: 1 }} align="right">
                  <Tooltip title="Remove element">
                    <IconButton
                      className="el-delete-btn"
                      size="small"
                      onClick={() => onDelete(el.element_id)}
                      disabled={isDeleting}
                      sx={{ opacity: 0, transition: "opacity 0.15s", color: "text.disabled", "&:hover": { color: "error.main", bgcolor: "transparent" }, width: 28, height: 28 }}
                    >
                      <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
