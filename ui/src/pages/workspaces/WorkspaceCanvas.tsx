import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Box, Typography, Paper, Button, Chip, Divider, Alert,
  IconButton, Skeleton, Tooltip,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloseIcon from "@mui/icons-material/Close";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { PaletteStrip } from "../../components/PaletteStrip";
import { api } from "../../lib/api/client";

interface WorkspaceElement {
  element_id: string;
  look_id: string;
  garment_id: string;
  garment_type: string;
  element_type: "color" | "fabric" | "pattern" | "silhouette";
  data: Record<string, unknown>;
  source_brand: string;
  row: string;
}

interface Workspace {
  _id: string;
  name: string;
  status: "draft" | "ready" | "generating";
  elements: WorkspaceElement[];
}

const ELEMENT_CHIP_COLORS: Record<string, "warning" | "info" | "secondary" | "default"> = {
  color: "warning",
  fabric: "info",
  pattern: "secondary",
  silhouette: "default",
};

export default function WorkspaceCanvas() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();

  const { data: ws, isLoading } = useQuery<Workspace>({
    queryKey: ["workspace", id],
    queryFn: async () => {
      const { data } = await api.get(`/workspace/${id}`);
      return data;
    },
    enabled: !!id,
    refetchInterval: (query) => query.state.data?.status === "generating" ? 5000 : false,
  });

  const removeEl = useMutation({
    mutationFn: async (elementId: string) => {
      await api.delete(`/workspace/${id}/elements/${elementId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspace", id] }),
  });

  const generate = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/workspace/${id}/generate`);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspace", id] }),
  });

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="text" width={120} height={32} sx={{ mb: 4 }} />
        <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 2, mb: 2 }} />
        <Skeleton variant="rectangular" height={160} sx={{ borderRadius: 2 }} />
      </Box>
    );
  }

  if (!ws) return <Alert severity="error">Workspace not found.</Alert>;

  // Group elements by row (garment_type)
  const rows = new Map<string, WorkspaceElement[]>();
  for (const el of ws.elements) {
    const row = el.row || el.garment_type || "other";
    if (!rows.has(row)) rows.set(row, []);
    rows.get(row)!.push(el);
  }

  const isGenerating = ws.status === "generating";

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 5 }}>
        <Box>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => nav(-1)}
            sx={{ color: "text.secondary", mb: 1.5, fontWeight: 500, "&:hover": { color: "primary.main" } }}
          >
            Back
          </Button>
          <Typography sx={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", color: "text.primary" }}>
            {ws.name}
          </Typography>
          <Typography sx={{ color: "text.secondary", fontSize: 14, mt: 0.5 }}>
            {ws.elements.length} element{ws.elements.length !== 1 ? "s" : ""}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AutoAwesomeIcon />}
          disabled={ws.elements.length === 0 || isGenerating || generate.isPending}
          onClick={() => generate.mutate()}
          sx={{ mt: 1, borderRadius: "10px", py: 1.5, px: 3 }}
        >
          {isGenerating ? "Generating…" : "Generate Collection"}
        </Button>
      </Box>

      {/* Generating banner */}
      {isGenerating && (
        <Alert severity="info" sx={{ mb: 4, borderRadius: "12px", border: "1px solid #e3f2fd" }}>
          Your collection is being generated. This may take a few minutes.
        </Alert>
      )}

      {/* Canvas */}
      {ws.elements.length === 0 ? (
        <Paper
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px dashed #f0e4e2",
            bgcolor: "#faf8f7",
            py: 10,
          }}
        >
          <Box sx={{ textAlign: "center" }}>
            <Typography sx={{ color: "text.secondary", fontFamily: "'Literata', Georgia, serif", fontSize: 18, mb: 1 }}>
              No elements yet
            </Typography>
            <Typography sx={{ color: "text.disabled", fontSize: 14 }}>
              Go to a look and add color, fabric, or pattern elements.
            </Typography>
          </Box>
        </Paper>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {[...rows.entries()].map(([rowKey, elements]) => (
            <Paper key={rowKey} sx={{ p: 3 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2.5 }}>
                <Typography
                  sx={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.2em",
                    color: "primary.main",
                  }}
                >
                  {rowKey}
                </Typography>
                <Divider sx={{ flex: 1, borderColor: "#f0e4e2" }} />
                <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
                  {elements.length} element{elements.length !== 1 ? "s" : ""}
                </Typography>
              </Box>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5 }}>
                {elements.map((el) => (
                  <ElementCard
                    key={el.element_id}
                    element={el}
                    onRemove={() => removeEl.mutate(el.element_id)}
                    removing={removeEl.isPending}
                  />
                ))}
              </Box>
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
}

function ElementCard({
  element,
  onRemove,
  removing,
}: {
  element: WorkspaceElement;
  onRemove: () => void;
  removing: boolean;
}) {
  const colors = (element.data?.colors as Array<{ hex?: string; name?: string; family?: string }>) ?? [];
  const chipColor = ELEMENT_CHIP_COLORS[element.element_type] ?? "default";

  return (
    <Paper
      sx={{
        px: 2.5,
        py: 2,
        minWidth: 140,
        maxWidth: 200,
        position: "relative",
        "&:hover .remove-btn": { opacity: 1 },
        border: "1px solid #f0e4e2",
        borderRadius: "12px",
      }}
    >
      <Tooltip title="Remove">
        <IconButton
          className="remove-btn"
          size="small"
          disabled={removing}
          onClick={onRemove}
          sx={{
            position: "absolute",
            top: 6,
            right: 6,
            opacity: 0,
            transition: "opacity 0.15s",
            width: 20,
            height: 20,
            bgcolor: "#fff0ef",
            color: "primary.main",
            "&:hover": { bgcolor: "#a93533", color: "#fff" },
          }}
        >
          <CloseIcon sx={{ fontSize: 12 }} />
        </IconButton>
      </Tooltip>

      <Chip
        label={element.element_type}
        color={chipColor}
        size="small"
        sx={{ mb: 1.5, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}
      />

      {element.element_type === "color" && colors.length > 0 && (
        <PaletteStrip swatches={colors.map((c) => ({ hex: c.hex ?? "#ccc", name: c.name, family: c.family }))} size={20} />
      )}

      {element.element_type === "fabric" && (
        <Typography sx={{ fontSize: 13, fontWeight: 500, color: "text.primary" }}>
          {typeof element.data?.fabric === "string" ? element.data.fabric : (element.data?.fabric as { name?: string })?.name ?? "Unknown"}
        </Typography>
      )}

      {element.element_type === "pattern" && (
        <Typography sx={{ fontSize: 13, fontWeight: 500, color: "text.primary", textTransform: "capitalize" }}>
          {element.data?.pattern as string ?? "—"}
        </Typography>
      )}

      <Typography sx={{ fontSize: 10, color: "text.disabled", mt: 1, textTransform: "capitalize" }}>
        {element.source_brand}
      </Typography>
    </Paper>
  );
}
