import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Box, Typography, Paper, Button, Chip, Divider, Alert, Skeleton,
  IconButton, Tooltip, CircularProgress, Snackbar,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AddPhotoAlternateIcon from "@mui/icons-material/AddPhotoAlternate";
import DrawOutlinedIcon from "@mui/icons-material/DrawOutlined";
import AddIcon from "@mui/icons-material/Add";
import { api } from "../../lib/api/client";
import { useAuth } from "../../lib/auth-context";
import { WorkspacePicker } from "../../components/WorkspacePicker";

interface Garment {
  garment_id: string;
  piece: string;
  garment_type: string;
  colors: Array<{ hex: string; name?: string; role?: string; pantone?: string }>;
  fabrics: Array<{ name: string; material: string; image_url: string | null }>;
  patterns: Array<{ name: string; motif?: string | null; image_url: string | null }>;
  flat_url: string | null;
  composition: Array<{ fiber: string; pct: number | null }>;
}

interface AnalysisColor { hex: string; family?: string; name?: string; role?: string }
interface AnalysisPattern { value: string; motif?: string }
interface AnalysisFiber { value: string; percentage?: number }
interface AnalysisItem { value: string }
interface LookAnalysis {
  colors?: AnalysisColor[];
  patterns?: AnalysisPattern[];
  fibers?: AnalysisFiber[];
  fabrics?: AnalysisItem[];
  silhouettes?: AnalysisItem[];
  themes?: AnalysisItem[];
  details?: AnalysisItem[];
}

interface Look {
  id: string;
  brand: string;
  season: string;
  year: number;
  name?: string;
  images: string[];
  tags: string[];
  category?: string;
  analysis?: LookAnalysis | null;
  is_deconstructed?: boolean;
}

type AddingKey = "colors" | `pattern:${string}` | `fiber:${string}` | `silhouette:${string}` | null;

export default function LookDetailPage() {
  const { lookId } = useParams<{ lookId: string }>();
  const navigate = useNavigate();
  const { activeProject } = useAuth();
  const qc = useQueryClient();

  const [imageIdx, setImageIdx] = useState(0);
  const [addingKey, setAddingKey] = useState<AddingKey>(null);
  const [pendingRetail, setPendingRetail] = useState<{
    key: AddingKey;
    elementType: "color" | "fabric" | "pattern" | "silhouette";
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

  const { data: garments, isLoading: garmentsLoading } = useQuery<Garment[]>({
    queryKey: ["look-garments", lookId],
    queryFn: async () => {
      const { data } = await api.get(`/looks/${lookId}/garments`);
      return data.garments ?? data;
    },
    enabled: !!lookId,
  });

  function requestRetailAdd(
    key: AddingKey,
    elementType: "color" | "fabric" | "pattern" | "silhouette",
    elementData: Record<string, unknown>,
    label: string,
  ) {
    if (!activeProject || !lookId || !look) return;
    setAddingKey(key);
    setPendingRetail({ key, elementType, data: elementData, label });
  }

  async function handleRetailWorkspaceSelected(wsId: string) {
    if (!pendingRetail || !look || !lookId) return;
    const { elementType, data, label } = pendingRetail;
    setPendingRetail(null);
    try {
      const { data: updatedWs } = await api.post(`/workspace/${wsId}/elements`, {
        look_id: lookId,
        garment_id: "product",
        garment_type: "product",
        element_type: elementType,
        data,
        source_brand: look.brand,
        row: "product",
      });
      qc.setQueryData(["workspace", wsId], updatedWs);
      qc.removeQueries({ queryKey: ["workspaces"] });
      setSnackbarWsId(wsId);
      setSnackbarMsg(`${label} added to workspace`);
    } catch {
      setSnackbarMsg("Failed to add — try again");
    } finally {
      setAddingKey(null);
    }
  }

  if (lookLoading) {
    return (
      <Box>
        <Skeleton variant="text" width={120} height={32} sx={{ mb: 3 }} />
        <Box sx={{ display: "flex", gap: 4 }}>
          <Skeleton variant="rectangular" width="40%" height={520} sx={{ borderRadius: 2 }} />
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width="60%" height={48} />
            <Skeleton variant="text" width="40%" height={24} sx={{ mt: 1 }} />
            <Skeleton variant="rectangular" height={180} sx={{ mt: 3, borderRadius: 2 }} />
            <Skeleton variant="rectangular" height={180} sx={{ mt: 2, borderRadius: 2 }} />
          </Box>
        </Box>
      </Box>
    );
  }

  if (!look) return <Alert severity="error">Look not found.</Alert>;

  const subtitle = [look.season, look.year > 0 ? look.year : null].filter(Boolean).join(" ");

  return (
    <Box>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate(-1)}
        sx={{ color: "text.secondary", mb: 3, fontWeight: 500, "&:hover": { color: "primary.main" } }}
      >
        Back to Looks
      </Button>

      <Box sx={{ display: "flex", gap: { xs: 2, md: 5 }, flexDirection: { xs: "column", md: "row" } }}>
        {/* Left: Image */}
        <Box sx={{ width: { xs: "100%", md: "40%" }, flexShrink: 0 }}>
          <Paper
            sx={{
              overflow: "hidden",
              bgcolor: "#f5f0ef",
              aspectRatio: "3/4",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            {look.is_deconstructed && (
              <Box
                sx={{
                  position: "absolute",
                  top: 14,
                  left: 14,
                  bgcolor: "rgba(0,0,0,0.72)",
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.15em",
                  px: 1.5,
                  py: 0.5,
                  borderRadius: "4px",
                  backdropFilter: "blur(4px)",
                }}
              >
                {look.analysis ? "PRODUCT · TAGGED" : "RUNWAY · FULL LOOK"}
              </Box>
            )}
            {look.images?.[imageIdx] ? (
              <Box
                component="img"
                src={look.images[imageIdx]}
                alt={`${look.brand} ${look.season}`}
                sx={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <AddPhotoAlternateIcon sx={{ fontSize: 60, color: "#dfbfbc" }} />
            )}
          </Paper>

          {look.images?.length > 1 && (
            <Box sx={{ display: "flex", gap: 1, mt: 1.5, overflowX: "auto" }}>
              {look.images.slice(0, 8).map((img, i) => (
                <Box
                  key={i}
                  component="img"
                  src={img}
                  onClick={() => setImageIdx(i)}
                  sx={{
                    width: 56,
                    height: 70,
                    objectFit: "cover",
                    borderRadius: 1,
                    cursor: "pointer",
                    border: i === imageIdx ? "2px solid #a93533" : "2px solid transparent",
                    opacity: i === imageIdx ? 1 : 0.55,
                    flexShrink: 0,
                    transition: "opacity 0.15s",
                  }}
                />
              ))}
            </Box>
          )}
        </Box>

        {/* Right: Details */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {subtitle && (
            <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 0.5, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              {subtitle}
              {look.category ? ` · ${look.category}` : ""}
            </Typography>
          )}
          <Typography
            sx={{
              fontFamily: "'Literata', Georgia, serif",
              fontSize: { xs: 32, md: 44 },
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "text.primary",
              lineHeight: 1.05,
              mb: 1.5,
            }}
          >
            {look.name || look.brand}
          </Typography>
          {look.name && (
            <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 2, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {look.brand}
            </Typography>
          )}

          {look.tags?.length > 0 && (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: 3 }}>
              {look.tags.slice(0, 6).map((tag) => (
                <Chip key={tag} label={tag} size="small" variant="outlined" sx={{ fontSize: 11, borderColor: "#f0e4e2", color: "text.secondary" }} />
              ))}
            </Box>
          )}

          <Divider sx={{ borderColor: "#f0e4e2", mb: 3 }} />

          {/* Garment rows or product analysis */}
          {garmentsLoading ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {[1, 2].map((i) => <Skeleton key={i} variant="rectangular" height={120} sx={{ borderRadius: 2 }} />)}
            </Box>
          ) : garments && garments.length > 0 ? (
            <Box sx={{ display: "flex", flexDirection: "column" }}>
              <Typography sx={{ fontFamily: "'Literata', Georgia, serif", fontSize: 15, fontStyle: "italic", color: "text.secondary", mb: 3, lineHeight: 1.7, borderLeft: "3px solid #f0e4e2", pl: 2 }}>
                The full look, broken into every garment — each with its own colour, fabric, pattern and technical sketch. Tap any element for its trend read.
              </Typography>

              {garments.map((garment, idx) => (
                <Box key={garment.garment_id}>
                  {idx > 0 && <Divider sx={{ borderColor: "#f0e4e2", my: 3 }} />}
                  <GarmentRow
                    garment={garment}
                    onOpen={() => navigate(`/app/looks/${lookId}/garment/${garment.garment_id}`)}
                  />
                </Box>
              ))}
            </Box>
          ) : look.analysis ? (
            <>
              {!activeProject && (
                <Alert severity="info" sx={{ mb: 2, borderRadius: "10px" }}>
                  Select a project in the sidebar to add elements to a workspace.
                </Alert>
              )}
              <ProductAnalysisCard
                analysis={look.analysis}
                canAdd={!!activeProject}
                addingKey={addingKey}
                onAddColors={() =>
                  requestRetailAdd(
                    "colors",
                    "color",
                    { colors: look.analysis!.colors },
                    "Color palette",
                  )
                }
                onAddPattern={(p) =>
                  requestRetailAdd(
                    `pattern:${p.value}`,
                    "pattern",
                    { pattern: p.value },
                    `Pattern "${p.value}"`,
                  )
                }
                onAddFiber={(f) =>
                  requestRetailAdd(
                    `fiber:${f.value}`,
                    "fabric",
                    { fabric: f.value },
                    `Fiber "${f.value}"`,
                  )
                }
                onAddSilhouette={(s) =>
                  requestRetailAdd(
                    `silhouette:${s.value}`,
                    "silhouette",
                    { garment_type: s.value.toLowerCase(), flat_url: null },
                    `Silhouette "${s.value}"`,
                  )
                }
              />
            </>
          ) : (
            <Paper sx={{ p: 4, textAlign: "center", bgcolor: "#faf8f7" }}>
              <Typography sx={{ color: "text.secondary", fontFamily: "'Literata', Georgia, serif", fontSize: 15 }}>
                No garment analysis available for this look yet.
              </Typography>
            </Paper>
          )}
        </Box>
      </Box>

      {/* Workspace picker for retail elements */}
      {activeProject && (
        <WorkspacePicker
          open={!!pendingRetail}
          projectId={activeProject.id}
          onClose={() => { setPendingRetail(null); setAddingKey(null); }}
          onSelect={handleRetailWorkspaceSelected}
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

function GarmentRow({ garment, onOpen }: { garment: Garment; onOpen: () => void }) {
  const dominantColor = garment.colors?.[0];
  const secondColor = garment.colors?.[1];
  const firstFabric = garment.fabrics?.[0];
  const firstPattern = garment.patterns?.[0];

  return (
    <Box>
      <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "text.disabled", mb: 0.5 }}>
        {garment.garment_type}
      </Typography>

      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2, justifyContent: "space-between" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 18, fontWeight: 600, color: "text.primary", mb: 2 }}>
            {garment.piece || garment.garment_type}
          </Typography>

          <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
            {/* SKETCH */}
            <ElementSquare label="SKETCH" color="#f5f0ef">
              <DrawOutlinedIcon sx={{ fontSize: 28, color: "#c8b9b7", position: "relative", zIndex: 1 }} />
              {garment.flat_url && (
                <Box
                  component="img"
                  src={garment.flat_url}
                  sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", zIndex: 2 }}
                  onError={(e) => { (e.target as HTMLElement).style.display = "none"; }}
                />
              )}
            </ElementSquare>

            {/* COLOUR */}
            <ElementSquare
              label={dominantColor?.name ?? "COLOUR"}
              color={dominantColor?.hex ?? "#f5f0ef"}
            >
              {secondColor && (
                <Box sx={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "40%", bgcolor: secondColor.hex }} />
              )}
            </ElementSquare>

            {/* FABRIC */}
            <ElementSquare label={firstFabric?.name ?? "FABRIC"} color="#ede8e4">
              {firstFabric ? (
                <>
                  <Typography sx={{ fontSize: 11, fontWeight: 600, color: "#8a7370", textAlign: "center", lineHeight: 1.3, px: 0.5, position: "relative", zIndex: 1 }}>
                    {firstFabric.name || firstFabric.material}
                  </Typography>
                  {firstFabric.image_url && (
                    <Box
                      component="img"
                      src={firstFabric.image_url}
                      sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 2 }}
                      onError={(e) => { (e.target as HTMLElement).style.display = "none"; }}
                    />
                  )}
                </>
              ) : (
                <Typography sx={{ fontSize: 10, color: "#c4b7b5" }}>—</Typography>
              )}
            </ElementSquare>

            {/* PATTERN */}
            <ElementSquare label={firstPattern?.name ?? "PATTERN"} color="#e4dedd">
              {firstPattern ? (
                <>
                  <Typography sx={{ fontSize: 10, fontWeight: 600, color: "#7a6b69", textAlign: "center", lineHeight: 1.3, px: 0.5, position: "relative", zIndex: 1 }}>
                    {firstPattern.name}
                  </Typography>
                  {firstPattern.image_url && (
                    <Box
                      sx={{
                        position: "absolute",
                        inset: 0,
                        zIndex: 2,
                        backgroundImage: `url(${firstPattern.image_url})`,
                        backgroundRepeat: "repeat",
                        backgroundSize: "36px",
                        opacity: 0.95,
                      }}
                    />
                  )}
                </>
              ) : (
                <Typography sx={{ fontSize: 10, color: "#c4b7b5" }}>—</Typography>
              )}
            </ElementSquare>
          </Box>
        </Box>

        <Button
          onClick={onOpen}
          variant="outlined"
          sx={{
            borderRadius: "20px",
            borderColor: "#f0e4e2",
            color: "text.secondary",
            fontSize: 13,
            fontWeight: 500,
            px: 2.5,
            py: 0.75,
            flexShrink: 0,
            mt: 3.5,
            "&:hover": { borderColor: "primary.main", color: "primary.main", bgcolor: "#fff0ef" },
          }}
        >
          open →
        </Button>
      </Box>
    </Box>
  );
}

function ElementSquare({
  label,
  color,
  children,
}: {
  label: string;
  color: string;
  children?: React.ReactNode;
}) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.75 }}>
      <Box
        sx={{
          width: 72,
          height: 72,
          borderRadius: "8px",
          bgcolor: color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
          border: "1px solid rgba(0,0,0,0.06)",
        }}
      >
        {children}
      </Box>
      <Typography sx={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "text.disabled", textAlign: "center", maxWidth: 72, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </Typography>
    </Box>
  );
}

function AddBtn({
  onClick,
  loading,
}: {
  onClick: () => void;
  loading: boolean;
}) {
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
          "&:hover": { bgcolor: "primary.main", color: "#fff", borderColor: "primary.main" },
          transition: "all 0.15s",
        }}
      >
        {loading ? <CircularProgress size={12} color="inherit" /> : <AddIcon sx={{ fontSize: 16 }} />}
      </IconButton>
    </Tooltip>
  );
}

function ProductAnalysisCard({
  analysis,
  canAdd,
  addingKey,
  onAddColors,
  onAddPattern,
  onAddFiber,
  onAddSilhouette,
}: {
  analysis: LookAnalysis;
  canAdd: boolean;
  addingKey: AddingKey;
  onAddColors: () => void;
  onAddPattern: (p: AnalysisPattern) => void;
  onAddFiber: (f: AnalysisFiber) => void;
  onAddSilhouette: (s: AnalysisItem) => void;
}) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {(analysis.colors?.length ?? 0) > 0 && (
        <Paper sx={{ p: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "primary.main" }}>
              Color Palette
            </Typography>
            {canAdd && (
              <AddBtn
                onClick={onAddColors}
                loading={addingKey === "colors"}
              />
            )}
          </Box>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
            {analysis.colors!.map((c, i) => (
              <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box sx={{ width: 28, height: 28, borderRadius: "50%", bgcolor: c.hex, border: "1px solid rgba(0,0,0,0.08)", flexShrink: 0 }} />
                <Box>
                  <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.primary", lineHeight: 1.2 }}>{c.name ?? c.family}</Typography>
                  {c.role && <Typography sx={{ fontSize: 10, color: "text.secondary", textTransform: "capitalize" }}>{c.role}</Typography>}
                </Box>
              </Box>
            ))}
          </Box>
        </Paper>
      )}

      {((analysis.patterns?.length ?? 0) > 0 || (analysis.fibers?.length ?? 0) > 0) && (
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          {(analysis.patterns?.length ?? 0) > 0 && (
            <Paper sx={{ p: 3, flex: 1, minWidth: 200 }}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "primary.main", mb: 2 }}>Patterns</Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {analysis.patterns!.map((p, i) => (
                  <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                    <Chip
                      label={p.motif ? `${p.value} · ${p.motif}` : p.value}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: 12, textTransform: "capitalize", borderColor: "#f0e4e2" }}
                    />
                    {canAdd && (
                      <AddBtn
                        onClick={() => onAddPattern(p)}
                        loading={addingKey === `pattern:${p.value}`}
                      />
                    )}
                  </Box>
                ))}
              </Box>
            </Paper>
          )}
          {(analysis.fibers?.length ?? 0) > 0 && (
            <Paper sx={{ p: 3, flex: 1, minWidth: 200 }}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "primary.main", mb: 2 }}>Fibers</Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {analysis.fibers!.map((f, i) => (
                  <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                    <Chip
                      label={f.percentage != null ? `${f.value} ${f.percentage}%` : f.value}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: 12, textTransform: "capitalize", borderColor: "#f0e4e2" }}
                    />
                    {canAdd && (
                      <AddBtn
                        onClick={() => onAddFiber(f)}
                        loading={addingKey === `fiber:${f.value}`}
                      />
                    )}
                  </Box>
                ))}
              </Box>
            </Paper>
          )}
        </Box>
      )}

      {((analysis.silhouettes?.length ?? 0) > 0 || (analysis.themes?.length ?? 0) > 0) && (
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          {(analysis.silhouettes?.length ?? 0) > 0 && (
            <Paper sx={{ p: 3, flex: 1, minWidth: 200 }}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "primary.main", mb: 2 }}>Silhouette</Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {analysis.silhouettes!.map((s, i) => (
                  <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                    <Chip label={s.value} size="small" sx={{ fontSize: 12, textTransform: "capitalize", bgcolor: "#faf8f7", borderColor: "#f0e4e2" }} variant="outlined" />
                    {canAdd && (
                      <AddBtn
                        onClick={() => onAddSilhouette(s)}
                        loading={addingKey === `silhouette:${s.value}`}
                      />
                    )}
                  </Box>
                ))}
              </Box>
            </Paper>
          )}
          {(analysis.themes?.length ?? 0) > 0 && (
            <Paper sx={{ p: 3, flex: 1, minWidth: 200 }}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "primary.main", mb: 2 }}>Themes</Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {analysis.themes!.map((t, i) => (
                  <Chip key={i} label={t.value.replace(/-/g, " ")} size="small" sx={{ fontSize: 12, textTransform: "capitalize", bgcolor: "#faf8f7", borderColor: "#f0e4e2" }} variant="outlined" />
                ))}
              </Box>
            </Paper>
          )}
        </Box>
      )}
    </Box>
  );
}
