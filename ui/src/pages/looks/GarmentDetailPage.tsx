import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import {
  Box, Typography, Paper, IconButton, Chip, Alert,
  Skeleton, Snackbar, Tooltip, CircularProgress, Divider,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AddIcon from "@mui/icons-material/Add";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api/client";
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

interface TrendStats {
  count: number;
  total: number;
  rank: number;
  stage: "now" | "next" | "emg";
  brands: string[];
}

interface TrendElement {
  kind: "color" | "fabric" | "pattern";
  family: string;
  stats: TrendStats;
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

interface GarmentTrends {
  garment_type: string;
  colors: TrendElement[];
  fabrics: TrendElement[];
  patterns: TrendElement[];
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

  const { data: trends } = useQuery<GarmentTrends>({
    queryKey: ["garment-trends", lookId, garmentId],
    queryFn: async () => {
      const { data } = await api.get(`/retail-trends/garment/${lookId}/${garmentId}`);
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
        garment_type: garment.garment_type || garment.piece || "other",
        element_type: type,
        data,
        source_brand: look?.brand ?? "",
        row: garment.garment_type || garment.piece || "other",
      });
      setSnackbarWsId(wsId);
      setSnackbarMsg(`${label} added to workspace`);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setSnackbarMsg(status === 409 ? "Already in this workspace" : "Failed to add element. Try again.");
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
        <Box sx={{ display: "flex", gap: 3 }}>
          <Skeleton variant="rectangular" width="45%" height={400} sx={{ borderRadius: 2 }} />
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="rectangular" height={180} sx={{ borderRadius: 2, mb: 2 }} />
            <Skeleton variant="rectangular" height={180} sx={{ borderRadius: 2 }} />
          </Box>
        </Box>
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
  const hasContent = !!(garment.flat_url || garment.colors?.length || garment.fabrics?.length || garment.patterns?.length || garment.composition?.length);

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

      {/* ── HERO ROW: Flat-lay + Colour palette side by side ── */}
      <Box sx={{ display: "flex", gap: { xs: 2, md: 4 }, mb: 4, flexDirection: { xs: "column", md: "row" }, alignItems: "stretch" }}>
        {/* Left: Product image / flat-lay */}
        <Box sx={{ width: { xs: "100%", md: "45%" }, flexShrink: 0 }}>
          {garment.flat_url ? (
            <Paper
              sx={{
                position: "relative",
                borderRadius: "16px",
                overflow: "hidden",
                bgcolor: "#f5f0ef",
                height: "100%",
                minHeight: 380,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                p: 3,
              }}
            >
              <Box
                component="img"
                src={garment.flat_url}
                alt={garment.piece}
                sx={{
                  maxWidth: "100%",
                  maxHeight: 420,
                  objectFit: "contain",
                  display: "block",
                }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              {activeProject && (
                <Box sx={{ position: "absolute", top: 14, right: 14 }}>
                  <AddBtn
                    onClick={() => requestAdd("silhouette", { flat_url: garment.flat_url, garment_type: garment.garment_type }, "Silhouette")}
                    loading={addingType === "silhouette"}
                  />
                </Box>
              )}
            </Paper>
          ) : (
            <Paper
              sx={{
                borderRadius: "16px",
                bgcolor: "#f5f0ef",
                height: "100%",
                minHeight: 240,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Typography sx={{ color: "text.disabled", fontSize: 13 }}>No flat-lay available</Typography>
            </Paper>
          )}
        </Box>

        {/* Right: Header + Colour palette */}
        <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {/* Header */}
          <Box sx={{ mb: 3 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "text.disabled", mb: 0.5 }}>
              {garment.garment_type}
            </Typography>
            <Typography sx={{
              fontFamily: "'Literata', Georgia, serif",
              fontSize: { xs: 28, md: 36 },
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "text.primary",
              lineHeight: 1.1,
            }}>
              {garment.piece || garment.garment_type}
            </Typography>
            {!activeProject && (
              <Alert severity="info" sx={{ mt: 2, borderRadius: "10px", fontSize: 13 }}>
                Select a project to add elements to a workspace.
              </Alert>
            )}
          </Box>

          {/* Colour palette */}
          {garment.colors?.length > 0 && (
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.18em", color: "text.disabled", mb: 2 }}>
                Colour Palette
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                {garment.colors.map((c, i) => (
                  <Box
                    key={i}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 2,
                      p: 1.5,
                      borderRadius: "10px",
                      border: "1px solid #f0e4e2",
                      bgcolor: "#fff",
                      transition: "border-color 0.15s",
                      "&:hover": { borderColor: "#dfbfbc" },
                    }}
                  >
                    <Box
                      sx={{
                        width: 48,
                        height: 48,
                        borderRadius: "8px",
                        bgcolor: c.hex,
                        border: "1px solid rgba(0,0,0,0.06)",
                        flexShrink: 0,
                      }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
                        <Typography sx={{ fontSize: 14, fontWeight: 600, color: "text.primary" }}>
                          {c.name ?? "Unnamed"}
                        </Typography>
                        {c.role && (
                          <Typography sx={{ fontSize: 10, color: "text.disabled", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                            {c.role}
                          </Typography>
                        )}
                      </Box>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.25 }}>
                        <Typography sx={{ fontSize: 11, color: "text.disabled", fontFamily: "'SF Mono', 'Fira Code', monospace" }}>
                          {c.hex.toUpperCase()}
                        </Typography>
                        {c.pantone && (
                          <>
                            <Box sx={{ width: 3, height: 3, borderRadius: "50%", bgcolor: "text.disabled" }} />
                            <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
                              {c.pantone}
                            </Typography>
                          </>
                        )}
                      </Box>
                    </Box>
                    {trends?.colors?.find((t) => t.family === (c.name || c.hex)) && (
                      <StageBadge
                        trend={trends.colors.find((t) => t.family === (c.name || c.hex))!}
                        garmentType={trends?.garment_type ?? garment.garment_type}
                      />
                    )}
                    {activeProject && (
                      <AddBtn
                        onClick={() => requestAdd("color", { colors: [c] }, c.name || "Colour")}
                        loading={false}
                      />
                    )}
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          {/* Composition — compact, sits under colours */}
          {garment.composition?.length > 0 && (
            <Box sx={{ mt: 3, pt: 2, borderTop: "1px solid #f0e4e2" }}>
              <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.18em", color: "text.disabled", mb: 1.5 }}>
                Composition
              </Typography>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                {garment.composition.map((c, i) => (
                  <Chip
                    key={i}
                    label={c.pct != null ? `${c.fiber} ${Math.round(c.pct)}%` : c.fiber}
                    size="small"
                    variant="outlined"
                    sx={{ textTransform: "capitalize", fontSize: 12, borderColor: "#e8dedd", fontWeight: 500 }}
                  />
                ))}
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      {/* ── MATERIALS ROW: Fabric + Pattern cards in a grid ── */}
      {(garment.fabrics?.length > 0 || garment.patterns?.length > 0) && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
            gap: 2.5,
          }}
        >
          {/* Fabric cards */}
          {garment.fabrics.map((fabric, i) => (
            <Paper
              key={`fabric-${i}`}
              sx={{
                borderRadius: "14px",
                border: "1px solid #f0e4e2",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Swatch image — square, not stretched */}
              {fabric.image_url && (
                <Box
                  component="img"
                  src={fabric.image_url}
                  alt={fabric.name}
                  sx={{
                    width: "100%",
                    aspectRatio: "4/3",
                    objectFit: "cover",
                    display: "block",
                    bgcolor: "#f5f0ef",
                  }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              )}
              <Box sx={{ p: 2.5, flex: 1 }}>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
                  <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.18em", color: "primary.main" }}>
                    {garment.fabrics.length > 1 ? `Fabric ${i + 1}` : "Fabric"}
                  </Typography>
                  {activeProject && (
                    <AddBtn
                      onClick={() => requestAdd("fabric", { fabric, image_url: fabric.image_url }, fabric.name || "Fabric")}
                      loading={addingType === "fabric"}
                    />
                  )}
                </Box>
                <Typography sx={{ fontSize: 16, fontWeight: 600, color: "text.primary", mt: 1, lineHeight: 1.3 }}>
                  {fabric.name || fabric.material}
                </Typography>
                {fabric.material && fabric.material !== fabric.name && (
                  <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.25 }}>
                    {fabric.material}
                  </Typography>
                )}
                {(fabric.weight || fabric.finish) && (
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 1.5 }}>
                    {fabric.weight && (
                      <Chip label={fabric.weight} size="small" variant="outlined" sx={{ fontSize: 10, textTransform: "capitalize", borderColor: "#e8dedd" }} />
                    )}
                    {fabric.finish && (
                      <Chip label={fabric.finish} size="small" variant="outlined" sx={{ fontSize: 10, textTransform: "capitalize", borderColor: "#e8dedd" }} />
                    )}
                  </Box>
                )}
                {fabric.description && (
                  <Typography sx={{
                    fontSize: 12,
                    color: "text.secondary",
                    mt: 1.5,
                    fontStyle: "italic",
                    lineHeight: 1.6,
                    fontFamily: "'Literata', Georgia, serif",
                  }}>
                    {fabric.description}
                  </Typography>
                )}
                {trends?.fabrics?.find((t) => t.family === (fabric.name || fabric.material)) && (
                  <Box sx={{ mt: 1.5 }}>
                    <StageBadge
                      trend={trends.fabrics.find((t) => t.family === (fabric.name || fabric.material))!}
                      garmentType={trends?.garment_type ?? garment.garment_type}
                    />
                  </Box>
                )}
              </Box>
            </Paper>
          ))}

          {/* Pattern cards */}
          {garment.patterns.map((pattern, i) => (
            <Paper
              key={`pattern-${i}`}
              sx={{
                borderRadius: "14px",
                border: "1px solid #f0e4e2",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Pattern tile — shown as a clear single tile */}
              {pattern.image_url && (
                <Box
                  component="img"
                  src={pattern.image_url}
                  alt={pattern.name}
                  sx={{
                    width: "100%",
                    aspectRatio: "4/3",
                    objectFit: "cover",
                    display: "block",
                    bgcolor: "#f5f0ef",
                  }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              )}
              <Box sx={{ p: 2.5, flex: 1 }}>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
                  <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.18em", color: "primary.main" }}>
                    {garment.patterns.length > 1 ? `Pattern ${i + 1}` : "Pattern"}
                  </Typography>
                  {activeProject && (
                    <AddBtn
                      onClick={() => requestAdd("pattern", { pattern: pattern.name, motif: pattern.motif, image_url: pattern.image_url }, pattern.name || "Pattern")}
                      loading={addingType === "pattern"}
                    />
                  )}
                </Box>
                <Typography sx={{ fontSize: 16, fontWeight: 600, color: "text.primary", mt: 1, lineHeight: 1.3 }}>
                  {pattern.name}
                </Typography>
                {pattern.motif && (
                  <Typography sx={{ fontSize: 12, color: "text.secondary", textTransform: "capitalize", mt: 0.25 }}>
                    {pattern.motif}
                  </Typography>
                )}
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 1.5, alignItems: "center" }}>
                  {pattern.type && pattern.type !== "none" && (
                    <Chip label={pattern.type.replace(/_/g, " ")} size="small" variant="outlined" sx={{ fontSize: 10, textTransform: "capitalize", borderColor: "#e8dedd" }} />
                  )}
                  {pattern.scale && (
                    <Chip label={`${pattern.scale} scale`} size="small" variant="outlined" sx={{ fontSize: 10, textTransform: "capitalize", borderColor: "#e8dedd" }} />
                  )}
                  {(pattern.colors?.length ?? 0) > 0 && pattern.colors!.map((hex, ci) => (
                    <Box key={ci} sx={{ width: 16, height: 16, borderRadius: "50%", bgcolor: hex, border: "1px solid rgba(0,0,0,0.08)" }} />
                  ))}
                </Box>
                {pattern.description && (
                  <Typography sx={{
                    fontSize: 12,
                    color: "text.secondary",
                    mt: 1.5,
                    fontStyle: "italic",
                    lineHeight: 1.6,
                    fontFamily: "'Literata', Georgia, serif",
                  }}>
                    {pattern.description}
                  </Typography>
                )}
                {trends?.patterns?.find((t) => t.family === pattern.name) && (
                  <Box sx={{ mt: 1.5 }}>
                    <StageBadge
                      trend={trends.patterns.find((t) => t.family === pattern.name)!}
                      garmentType={trends?.garment_type ?? garment.garment_type}
                    />
                  </Box>
                )}
              </Box>
            </Paper>
          ))}
        </Box>
      )}

      {/* Empty fallback */}
      {!hasContent && (
        <Paper sx={{ p: 5, textAlign: "center", bgcolor: "#faf8f7", borderRadius: "14px" }}>
          <Typography sx={{ color: "text.secondary", fontFamily: "'Literata', Georgia, serif", fontSize: 15 }}>
            No element data available for this garment yet.
          </Typography>
        </Paper>
      )}

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

const STAGE_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  now: { bg: "#e8f5e9", fg: "#2e7d32", label: "Now" },
  next: { bg: "#fff3e0", fg: "#e65100", label: "Next" },
  emg: { bg: "#ede7f6", fg: "#6a1b9a", label: "Emerging" },
};

function StageBadge({ trend, garmentType }: { trend: TrendElement; garmentType: string }) {
  const navigate = useNavigate();
  const stage = STAGE_COLORS[trend.stats.stage] ?? STAGE_COLORS.emg;

  return (
    <Box
      onClick={() =>
        navigate(
          `/app/trends/retail/element?kind=${trend.kind}&family=${encodeURIComponent(trend.family)}&garment_type=${encodeURIComponent(garmentType)}`,
        )
      }
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.75,
        px: 1.25,
        py: 0.5,
        borderRadius: "6px",
        bgcolor: stage.bg,
        cursor: "pointer",
        transition: "all 0.15s",
        "&:hover": { filter: "brightness(0.95)", transform: "translateY(-1px)" },
      }}
    >
      <TrendingUpIcon sx={{ fontSize: 13, color: stage.fg }} />
      <Typography sx={{ fontSize: 11, fontWeight: 700, color: stage.fg, letterSpacing: "0.04em" }}>
        {stage.label}
      </Typography>
      <Typography sx={{ fontSize: 10, color: stage.fg, opacity: 0.8 }}>
        {trend.stats.count}/{trend.stats.total}
      </Typography>
    </Box>
  );
}

/* ── Small add-to-workspace button ── */
function AddBtn({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <Tooltip title="Add to workspace">
      <IconButton
        size="small"
        onClick={onClick}
        disabled={loading}
        sx={{
          width: 28,
          height: 28,
          bgcolor: "#fff0ef",
          color: "primary.main",
          border: "1px solid #f0e4e2",
          flexShrink: 0,
          "&:hover": { bgcolor: "primary.main", color: "#fff", borderColor: "primary.main" },
          transition: "all 0.15s",
        }}
      >
        {loading ? <CircularProgress size={12} color="inherit" /> : <AddIcon sx={{ fontSize: 16 }} />}
      </IconButton>
    </Tooltip>
  );
}
