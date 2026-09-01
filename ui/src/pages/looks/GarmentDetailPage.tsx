import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Box, Typography, Paper, IconButton, Chip, Alert,
  Skeleton, Snackbar, Tooltip, CircularProgress, Divider,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AddIcon from "@mui/icons-material/Add";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api/client";
import { PaletteStrip } from "../../components/PaletteStrip";
import { WorkspacePicker } from "../../components/WorkspacePicker";

interface FabricEntry {
  name: string;
  material: string;
  weight?: string | null;
  finish?: string | null;
  description?: string | null;
  image_url: string | null;
}

interface PatternEntry {
  name: string;
  motif?: string | null;
  type?: string | null;
  scale?: string | null;
  colors?: string[];
  description?: string | null;
  image_url: string | null;
}

interface Garment {
  garment_id: string;
  piece: string;
  garment_type: string;
  colors: Array<{ hex: string; name?: string; role?: string; pantone?: string }>;
  fabrics: FabricEntry[];
  patterns: PatternEntry[];
  flat_url: string | null;
  composition: Array<{ fiber: string; pct: number | null }>;
}

interface Look {
  id: string;
  brand: string;
  season: string;
  year: number;
  name?: string;
}

type AddingType = "fabric" | "pattern" | "silhouette" | null;

export default function GarmentDetailPage() {
  const { lookId, garmentId } = useParams<{ lookId: string; garmentId: string }>();
  const navigate = useNavigate();
  const { activeProject } = useAuth();

  const [addingType, setAddingType] = useState<AddingType>(null);
  const [pendingElement, setPendingElement] = useState<{
    type: "color" | "fabric" | "pattern" | "silhouette";
    data: Record<string, unknown>;
    label: string;
  } | null>(null);
  const [snackbarMsg, setSnackbarMsg] = useState<string | null>(null);
  const [snackbarWsId, setSnackbarWsId] = useState<string | null>(null);

  const { data: look, isLoading: lookLoading } = useQuery<Look>({
    queryKey: ["look", lookId],
    queryFn: async () => {
      const { data } = await api.get(`/looks/${lookId}`);
      return data;
    },
    enabled: !!lookId,
  });

  const { data: garment, isLoading: garmentLoading } = useQuery<Garment>({
    queryKey: ["look-garment", lookId, garmentId],
    queryFn: async () => {
      const { data } = await api.get(`/looks/${lookId}/garments/${garmentId}`);
      return data;
    },
    enabled: !!lookId && !!garmentId,
  });

  function requestAdd(
    elementType: "color" | "fabric" | "pattern" | "silhouette",
    elementData: Record<string, unknown>,
    label: string,
  ) {
    if (!activeProject || !garment) return;
    setAddingType(elementType === "color" ? null : elementType as AddingType);
    setPendingElement({ type: elementType, data: elementData, label });
  }

  async function handleWorkspaceSelected(wsId: string) {
    if (!pendingElement || !garment) return;
    const { type, data, label } = pendingElement;
    setPendingElement(null);
    try {
      await api.post(`/workspace/${wsId}/elements`, {
        look_id: lookId,
        garment_id: garmentId,
        garment_type: garment.garment_type,
        element_type: type,
        data,
        source_brand: look?.brand ?? "",
        row: garment.garment_type,
      });
      setSnackbarWsId(wsId);
      setSnackbarMsg(`${label} added to workspace`);
    } catch {
      setSnackbarMsg("Failed to add element. Try again.");
    } finally {
      setAddingType(null);
    }
  }

  const isLoading = lookLoading || garmentLoading;

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="text" width={160} height={32} sx={{ mb: 3 }} />
        <Skeleton variant="text" width="50%" height={48} sx={{ mb: 2 }} />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rectangular" height={160} sx={{ borderRadius: 2, mb: 2 }} />
        ))}
      </Box>
    );
  }

  if (!garment) {
    return (
      <Box>
        <Box
          onClick={() => navigate(`/app/looks/${lookId}`)}
          sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 3, cursor: "pointer", width: "fit-content" }}
        >
          <ArrowBackIcon sx={{ fontSize: 16, color: "text.secondary" }} />
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            Back to {look?.name || look?.brand || "Look"}
          </Typography>
        </Box>
        <Alert severity="error">Garment not found.</Alert>
      </Box>
    );
  }

  const lookLabel = look ? (look.name || look.brand) : "Look";

  return (
    <Box>
      {/* Back breadcrumb */}
      <Box
        onClick={() => navigate(`/app/looks/${lookId}`)}
        sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 3, cursor: "pointer", width: "fit-content" }}
      >
        <ArrowBackIcon sx={{ fontSize: 16, color: "text.secondary" }} />
        <Typography sx={{ fontSize: 13, color: "text.secondary", "&:hover": { color: "primary.main" }, transition: "color 0.15s" }}>
          Back to {lookLabel}
        </Typography>
      </Box>

      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "text.disabled", mb: 0.5 }}>
          {garment.garment_type}
        </Typography>
        <Typography sx={{
          fontFamily: "'Literata', Georgia, serif",
          fontSize: { xs: 28, md: 38 },
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: "text.primary",
          lineHeight: 1.1,
        }}>
          {garment.piece || garment.garment_type}
        </Typography>
        {!activeProject && (
          <Alert severity="info" sx={{ mt: 2, borderRadius: "10px" }}>
            Select a project in the sidebar to add elements to a workspace.
          </Alert>
        )}
      </Box>

      <Box sx={{ display: "flex", gap: 3, flexDirection: { xs: "column", md: "row" }, alignItems: "flex-start" }}>
        {/* Left column: flat illustration */}
        {garment.flat_url && (
          <Box sx={{ flexShrink: 0, width: { xs: "100%", md: 240 } }}>
            <ElementCard
              title="TECHNICAL FLAT"
              onAdd={activeProject ? () => requestAdd("silhouette", { flat_url: garment.flat_url, garment_type: garment.garment_type }, "Silhouette") : undefined}
              adding={addingType === "silhouette"}
            >
              <Box
                component="img"
                src={garment.flat_url}
                alt="Technical flat"
                sx={{
                  width: "100%",
                  maxHeight: 320,
                  objectFit: "contain",
                  borderRadius: "8px",
                  bgcolor: "#f5f0ef",
                  display: "block",
                }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </ElementCard>
          </Box>
        )}

        {/* Right column: element cards */}
        <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          {/* PALETTE */}
          {garment.colors?.length > 0 && (
            <ElementCard
              title="PALETTE"
              onAdd={activeProject ? () => requestAdd("color", { colors: garment.colors }, "Color palette") : undefined}
              adding={false}
            >
              <Box sx={{ mb: 2 }}>
                <PaletteStrip
                  swatches={garment.colors.map((c) => ({ hex: c.hex, name: c.name, family: undefined }))}
                  size={32}
                />
              </Box>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
                {garment.colors.map((c, i) => (
                  <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    <Box sx={{ width: 20, height: 20, borderRadius: "50%", bgcolor: c.hex, border: "1px solid rgba(0,0,0,0.08)", flexShrink: 0 }} />
                    <Typography sx={{ fontSize: 13, color: "text.primary", fontWeight: 500, flex: 1 }}>
                      {c.name ?? c.hex}
                    </Typography>
                    {c.role && (
                      <Chip
                        label={c.role}
                        size="small"
                        sx={{ fontSize: 9, fontWeight: 700, textTransform: "capitalize", height: 18, bgcolor: "#faf8f7", borderColor: "#f0e4e2" }}
                        variant="outlined"
                      />
                    )}
                  </Box>
                ))}
              </Box>
            </ElementCard>
          )}

          {/* FABRIC(S) */}
          {garment.fabrics?.length > 0 && garment.fabrics.map((fabric, i) => (
            <ElementCard
              key={i}
              title={garment.fabrics.length > 1 ? `FABRIC ${i + 1}` : "FABRIC"}
              onAdd={activeProject ? () => requestAdd("fabric", { fabric, image_url: fabric.image_url }, fabric.name || "Fabric") : undefined}
              adding={addingType === "fabric"}
            >
              {fabric.image_url && (
                <Box
                  component="img"
                  src={fabric.image_url}
                  alt={fabric.name}
                  sx={{
                    width: "100%",
                    height: 120,
                    objectFit: "cover",
                    borderRadius: "8px",
                    mb: 2,
                    display: "block",
                    bgcolor: "#f5f0ef",
                  }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              )}
              <Typography sx={{ fontSize: 16, fontWeight: 600, color: "text.primary", mb: 0.5 }}>
                {fabric.name || fabric.material}
              </Typography>
              {fabric.material && fabric.material !== fabric.name && (
                <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1 }}>
                  {fabric.material}
                </Typography>
              )}
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 1 }}>
                {fabric.weight && (
                  <Chip label={fabric.weight} size="small" variant="outlined" sx={{ fontSize: 11, textTransform: "capitalize", borderColor: "#f0e4e2" }} />
                )}
                {fabric.finish && (
                  <Chip label={fabric.finish} size="small" variant="outlined" sx={{ fontSize: 11, textTransform: "capitalize", borderColor: "#f0e4e2" }} />
                )}
              </Box>
              {fabric.description && (
                <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 1.5, fontStyle: "italic", lineHeight: 1.5 }}>
                  {fabric.description}
                </Typography>
              )}
            </ElementCard>
          ))}

          {/* PATTERN(S) */}
          {garment.patterns?.length > 0 && garment.patterns.map((pattern, i) => (
            <ElementCard
              key={i}
              title={garment.patterns.length > 1 ? `PATTERN ${i + 1}` : "PATTERN"}
              onAdd={activeProject ? () => requestAdd("pattern", { pattern: pattern.name, motif: pattern.motif, image_url: pattern.image_url }, pattern.name || "Pattern") : undefined}
              adding={addingType === "pattern"}
            >
              {pattern.image_url && (
                <Box
                  sx={{
                    width: "100%",
                    height: 120,
                    borderRadius: "8px",
                    mb: 2,
                    overflow: "hidden",
                    backgroundImage: `url(${pattern.image_url})`,
                    backgroundRepeat: "repeat",
                    backgroundSize: "96px",
                    bgcolor: "#f5f0ef",
                  }}
                />
              )}
              <Typography sx={{ fontSize: 16, fontWeight: 600, color: "text.primary", mb: 0.5 }}>
                {pattern.name}
              </Typography>
              {pattern.motif && (
                <Typography sx={{ fontSize: 13, color: "text.secondary", textTransform: "capitalize", mb: 1 }}>
                  {pattern.motif}
                </Typography>
              )}
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 0.5 }}>
                {pattern.type && pattern.type !== "none" && (
                  <Chip label={pattern.type.replace(/_/g, " ")} size="small" variant="outlined" sx={{ fontSize: 11, textTransform: "capitalize", borderColor: "#f0e4e2" }} />
                )}
                {pattern.scale && (
                  <Chip label={`${pattern.scale} scale`} size="small" variant="outlined" sx={{ fontSize: 11, textTransform: "capitalize", borderColor: "#f0e4e2" }} />
                )}
              </Box>
              {(pattern.colors?.length ?? 0) > 0 && (
                <Box sx={{ display: "flex", gap: 1, mt: 1.5, flexWrap: "wrap" }}>
                  {pattern.colors!.map((hex, ci) => (
                    <Box key={ci} sx={{ width: 18, height: 18, borderRadius: "50%", bgcolor: hex, border: "1px solid rgba(0,0,0,0.08)" }} />
                  ))}
                </Box>
              )}
              {pattern.description && (
                <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 1.5, fontStyle: "italic", lineHeight: 1.5 }}>
                  {pattern.description}
                </Typography>
              )}
            </ElementCard>
          ))}

          {/* COMPOSITION */}
          {garment.composition?.length > 0 && (
            <ElementCard title="COMPOSITION">
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {garment.composition.map((c, i) => (
                  <Chip
                    key={i}
                    label={c.pct != null ? `${c.fiber} ${Math.round(c.pct)}%` : c.fiber}
                    size="small"
                    variant="outlined"
                    sx={{ textTransform: "capitalize", fontSize: 12, borderColor: "#f0e4e2" }}
                  />
                ))}
              </Box>
            </ElementCard>
          )}

          {/* Empty fallback */}
          {!garment.colors?.length && !garment.fabrics?.length && !garment.patterns?.length && !garment.composition?.length && (
            <Paper sx={{ p: 5, textAlign: "center", bgcolor: "#faf8f7" }}>
              <Typography sx={{ color: "text.secondary", fontFamily: "'Literata', Georgia, serif", fontSize: 15 }}>
                No element data available for this garment yet.
              </Typography>
            </Paper>
          )}
        </Box>
      </Box>

      {/* Workspace picker */}
      {activeProject && (
        <WorkspacePicker
          open={!!pendingElement}
          projectId={activeProject.id}
          onClose={() => { setPendingElement(null); setAddingType(null); }}
          onSelect={handleWorkspaceSelected}
        />
      )}

      {/* Snackbar */}
      <Snackbar
        open={!!snackbarMsg}
        autoHideDuration={4000}
        onClose={() => { setSnackbarMsg(null); setSnackbarWsId(null); }}
        message={
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {snackbarMsg}
            {snackbarWsId && (
              <>
                <Divider orientation="vertical" flexItem sx={{ borderColor: "rgba(255,255,255,0.3)", mx: 0.5 }} />
                <Typography
                  component={Link}
                  to={`/app/workspace/${snackbarWsId}`}
                  sx={{ color: "#ffcdd2", fontSize: 13, fontWeight: 600, textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
                >
                  View canvas →
                </Typography>
              </>
            )}
          </Box>
        }
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        ContentProps={{ sx: { bgcolor: "#241918", borderRadius: "12px", fontSize: 14 } }}
      />
    </Box>
  );
}

function ElementCard({
  title,
  children,
  onAdd,
  adding = false,
}: {
  title: string;
  children: React.ReactNode;
  onAdd?: () => void;
  adding?: boolean;
}) {
  return (
    <Paper
      sx={{
        p: 3,
        border: "1px solid #f0e4e2",
        borderRadius: "14px",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "primary.main" }}>
          {title}
        </Typography>
        {onAdd && (
          <Tooltip title="Add to workspace">
            <IconButton
              size="small"
              onClick={onAdd}
              disabled={adding}
              sx={{
                width: 32,
                height: 32,
                bgcolor: "#fff0ef",
                color: "primary.main",
                border: "1px solid #f0e4e2",
                "&:hover": { bgcolor: "primary.main", color: "#fff", borderColor: "primary.main" },
                transition: "all 0.15s",
              }}
            >
              {adding ? <CircularProgress size={14} color="inherit" /> : <AddIcon sx={{ fontSize: 18 }} />}
            </IconButton>
          </Tooltip>
        )}
      </Box>
      {children}
    </Paper>
  );
}
