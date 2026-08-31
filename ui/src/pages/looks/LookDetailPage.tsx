import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Box, Typography, Paper, Button, Chip, Divider, Alert,
  Select, MenuItem, FormControl, InputLabel, Skeleton,
  Snackbar, IconButton,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AddIcon from "@mui/icons-material/Add";
import AddPhotoAlternateIcon from "@mui/icons-material/AddPhotoAlternate";
import { PaletteStrip } from "../../components/PaletteStrip";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api/client";

interface Garment {
  garment_id: string;
  piece: string;
  garment_type: string;
  colors: Array<{ hex: string; family?: string; name?: string }>;
  fabric: { type?: string; name?: string; weight?: string } | null;
  pattern: string | null;
  materials_candidates?: string[];
}

interface AnalysisColor {
  hex: string;
  family?: string;
  name?: string;
  role?: string;
  pantone?: string;
}

interface AnalysisPattern {
  value: string;
  motif?: string;
  evidence?: string;
  confidence?: number;
}

interface AnalysisFiber {
  value: string;
  percentage?: number;
  evidence?: string;
  confidence?: number;
}

interface AnalysisItem {
  value: string;
  evidence?: string;
  confidence?: number;
}

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

interface Workspace {
  _id: string;
  name: string;
  status: string;
}

export default function LookDetailPage() {
  const { lookId } = useParams<{ lookId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, activeProject } = useAuth();

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);
  const [imageIdx, setImageIdx] = useState(0);

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

  const { data: workspaces } = useQuery<Workspace[]>({
    queryKey: ["workspaces"],
    queryFn: async () => {
      const projectId = activeProject?.id;
      const { data } = await api.get("/workspace", projectId ? { params: { projectId } } : {});
      return data.workspaces ?? data;
    },
    enabled: !!user,
  });

  const addElement = useMutation({
    mutationFn: async ({ garment, elementType }: { garment: Garment; elementType: "color" | "fabric" | "pattern" }) => {
      let wsId = selectedWorkspaceId;

      if (!wsId) {
        const projectId = activeProject?.id;
        if (!projectId) throw new Error("No active project selected");
        const { data: ws } = await api.post("/workspace", {
          name: `${look?.brand ?? "Look"} workspace`,
          project_id: projectId,
        });
        wsId = ws._id;
        setSelectedWorkspaceId(wsId);
        qc.invalidateQueries({ queryKey: ["workspaces"] });
      }

      let elementData: Record<string, unknown> = {};
      if (elementType === "color") elementData = { colors: garment.colors };
      else if (elementType === "fabric") elementData = { fabric: garment.fabric?.type ?? garment.fabric?.name ?? "Unknown" };
      else if (elementType === "pattern") elementData = { pattern: garment.pattern ?? "Unknown" };

      await api.post(`/workspace/${wsId}/elements`, {
        element: {
          look_id: lookId,
          garment_id: garment.garment_id,
          garment_type: garment.garment_type,
          element_type: elementType,
          data: elementData,
          source_brand: look?.brand ?? "",
          row: garment.garment_type,
        },
      });

      return wsId;
    },
    onSuccess: (wsId) => {
      setToast("Element added to workspace");
      qc.invalidateQueries({ queryKey: ["workspace", wsId] });
    },
    onError: (err) => {
      setToast(err instanceof Error ? err.message : "Failed to add element");
    },
  });

  if (lookLoading) {
    return (
      <Box>
        <Skeleton variant="text" width={120} height={32} sx={{ mb: 3 }} />
        <Box sx={{ display: "flex", gap: 4 }}>
          <Skeleton variant="rectangular" width="40%" height={520} sx={{ borderRadius: 2 }} />
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width="60%" height={48} />
            <Skeleton variant="text" width="40%" height={24} sx={{ mt: 1 }} />
            <Skeleton variant="rectangular" height={200} sx={{ mt: 3, borderRadius: 2 }} />
          </Box>
        </Box>
      </Box>
    );
  }

  if (!look) {
    return <Alert severity="error">Look not found.</Alert>;
  }

  return (
    <Box>
      {/* Back */}
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate(-1)}
        sx={{ color: "text.secondary", mb: 3, fontWeight: 500, "&:hover": { color: "primary.main" } }}
      >
        Back to Looks
      </Button>

      <Box sx={{ display: "flex", gap: { xs: 2, md: 5 }, flexDirection: { xs: "column", md: "row" } }}>
        {/* Left: Image */}
        <Box sx={{ width: { xs: "100%", md: "38%" }, flexShrink: 0 }}>
          <Paper sx={{ overflow: "hidden", bgcolor: "#f5f0ef", aspectRatio: "3/4", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
              {look.images.map((img, i) => (
                <Box
                  key={i}
                  component="img"
                  src={img}
                  onClick={() => setImageIdx(i)}
                  sx={{
                    width: 64,
                    height: 80,
                    objectFit: "cover",
                    borderRadius: 1,
                    cursor: "pointer",
                    border: i === imageIdx ? "2px solid #a93533" : "2px solid transparent",
                    opacity: i === imageIdx ? 1 : 0.6,
                    flexShrink: 0,
                  }}
                />
              ))}
            </Box>
          )}
        </Box>

        {/* Right: Details */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "primary.main", mb: 1 }}>
            {look.season && look.year ? `${look.season} ${look.year}` : look.brand}
          </Typography>
          <Typography sx={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", color: "text.primary", mb: look.name ? 0.5 : 1 }}>
            {look.name || look.brand}
          </Typography>
          {look.name && (
            <Typography sx={{ fontSize: 14, color: "text.secondary", mb: 1 }}>
              {look.brand}{look.category ? ` · ${look.category}` : ""}
            </Typography>
          )}
          {look.tags?.length > 0 && (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: 3 }}>
              {look.tags.slice(0, 6).map((tag) => (
                <Chip key={tag} label={tag} size="small" variant="outlined" sx={{ fontSize: 11, borderColor: "#f0e4e2", color: "text.secondary" }} />
              ))}
            </Box>
          )}

          {/* Workspace selector */}
          {(workspaces?.length ?? 0) > 0 && (
            <FormControl size="small" sx={{ mb: 3, minWidth: 240 }}>
              <InputLabel sx={{ color: "text.secondary", "&.Mui-focused": { color: "primary.main" } }}>
                Add to workspace
              </InputLabel>
              <Select
                value={selectedWorkspaceId}
                onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                label="Add to workspace"
                sx={{ "& .MuiOutlinedInput-notchedOutline": { borderColor: "#f0e4e2" } }}
              >
                <MenuItem value="">
                  <Typography sx={{ color: "text.secondary", fontSize: 14 }}>Auto-create workspace</Typography>
                </MenuItem>
                {workspaces?.map((ws) => (
                  <MenuItem key={ws._id} value={ws._id}>{ws.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <Divider sx={{ borderColor: "#f0e4e2", mb: 3 }} />

          {/* Analysis section */}
          {garmentsLoading ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {[1, 2, 3].map((i) => <Skeleton key={i} variant="rectangular" height={140} sx={{ borderRadius: 2 }} />)}
            </Box>
          ) : garments && garments.length > 0 ? (
            <>
              <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "text.secondary", mb: 2.5 }}>
                Garment Deconstruction
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {garments.map((garment) => (
                  <GarmentCard
                    key={garment.garment_id}
                    garment={garment}
                    onAdd={(elementType) => addElement.mutate({ garment, elementType })}
                    adding={addElement.isPending}
                  />
                ))}
              </Box>
            </>
          ) : look.analysis ? (
            <>
              <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "text.secondary", mb: 2.5 }}>
                Product Analysis
              </Typography>
              <ProductAnalysisCard analysis={look.analysis} />
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

      <Snackbar
        open={!!toast}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        message={toast}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Box>
  );
}

function ProductAnalysisCard({ analysis }: { analysis: LookAnalysis }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Colors */}
      {(analysis.colors?.length ?? 0) > 0 && (
        <Paper sx={{ p: 3 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "primary.main", mb: 2 }}>
            Color Palette
          </Typography>
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

      {/* Patterns + Fibers row */}
      {((analysis.patterns?.length ?? 0) > 0 || (analysis.fibers?.length ?? 0) > 0) && (
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          {(analysis.patterns?.length ?? 0) > 0 && (
            <Paper sx={{ p: 3, flex: 1, minWidth: 200 }}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "primary.main", mb: 2 }}>
                Patterns
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {analysis.patterns!.map((p, i) => (
                  <Box key={i}>
                    <Chip
                      label={p.motif ? `${p.value} · ${p.motif}` : p.value}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: 12, textTransform: "capitalize", borderColor: "#f0e4e2" }}
                    />
                  </Box>
                ))}
              </Box>
            </Paper>
          )}
          {(analysis.fibers?.length ?? 0) > 0 && (
            <Paper sx={{ p: 3, flex: 1, minWidth: 200 }}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "primary.main", mb: 2 }}>
                Fibers
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {analysis.fibers!.map((f, i) => (
                  <Chip
                    key={i}
                    label={f.percentage != null ? `${f.value} ${f.percentage}%` : f.value}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: 12, textTransform: "capitalize", borderColor: "#f0e4e2" }}
                  />
                ))}
              </Box>
            </Paper>
          )}
        </Box>
      )}

      {/* Silhouettes + Themes row */}
      {((analysis.silhouettes?.length ?? 0) > 0 || (analysis.themes?.length ?? 0) > 0) && (
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          {(analysis.silhouettes?.length ?? 0) > 0 && (
            <Paper sx={{ p: 3, flex: 1, minWidth: 200 }}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "primary.main", mb: 2 }}>
                Silhouette
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {analysis.silhouettes!.map((s, i) => (
                  <Chip key={i} label={s.value} size="small" sx={{ fontSize: 12, textTransform: "capitalize", bgcolor: "#faf8f7", borderColor: "#f0e4e2" }} variant="outlined" />
                ))}
              </Box>
            </Paper>
          )}
          {(analysis.themes?.length ?? 0) > 0 && (
            <Paper sx={{ p: 3, flex: 1, minWidth: 200 }}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "primary.main", mb: 2 }}>
                Themes
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {analysis.themes!.map((t, i) => (
                  <Chip key={i} label={t.value.replace(/-/g, " ")} size="small" sx={{ fontSize: 12, textTransform: "capitalize", bgcolor: "#faf8f7", borderColor: "#f0e4e2" }} variant="outlined" />
                ))}
              </Box>
            </Paper>
          )}
        </Box>
      )}

      {/* Details */}
      {(analysis.details?.length ?? 0) > 0 && (
        <Paper sx={{ p: 3 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "primary.main", mb: 2 }}>
            Details
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {analysis.details!.map((d, i) => (
              <Chip key={i} label={d.value} size="small" sx={{ fontSize: 12, bgcolor: "#faf8f7", borderColor: "#f0e4e2" }} variant="outlined" />
            ))}
          </Box>
        </Paper>
      )}
    </Box>
  );
}

function GarmentCard({
  garment,
  onAdd,
  adding,
}: {
  garment: Garment;
  onAdd: (type: "color" | "fabric" | "pattern") => void;
  adding: boolean;
}) {
  return (
    <Paper sx={{ p: 3 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "primary.main", mb: 1.5 }}>
        {garment.piece || garment.garment_type}
      </Typography>

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
        {/* Colors */}
        {garment.colors?.length > 0 && (
          <Box>
            <Typography sx={{ fontSize: 11, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.1em", mb: 1 }}>Colors</Typography>
            <PaletteStrip swatches={garment.colors} size={24} />
            <Button
              size="small"
              startIcon={<AddIcon />}
              disabled={adding}
              onClick={() => onAdd("color")}
              sx={{ mt: 1.5, fontSize: 11, color: "primary.main", "&:hover": { bgcolor: "#fff0ef" } }}
            >
              Add Colors
            </Button>
          </Box>
        )}

        {/* Fabric */}
        {garment.fabric && (
          <Box>
            <Typography sx={{ fontSize: 11, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.1em", mb: 1 }}>Fabric</Typography>
            <Typography sx={{ fontSize: 14, fontWeight: 500, color: "text.primary", mb: 0.5 }}>
              {garment.fabric.type ?? garment.fabric.name ?? "—"}
            </Typography>
            {garment.fabric.weight && (
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{garment.fabric.weight}</Typography>
            )}
            <Button
              size="small"
              startIcon={<AddIcon />}
              disabled={adding}
              onClick={() => onAdd("fabric")}
              sx={{ mt: 1, fontSize: 11, color: "primary.main", "&:hover": { bgcolor: "#fff0ef" } }}
            >
              Add Fabric
            </Button>
          </Box>
        )}

        {/* Pattern */}
        {garment.pattern && (
          <Box>
            <Typography sx={{ fontSize: 11, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.1em", mb: 1 }}>Pattern</Typography>
            <Chip label={garment.pattern} size="small" variant="outlined" sx={{ fontSize: 12, borderColor: "#f0e4e2", textTransform: "capitalize" }} />
            <Box sx={{ mt: 1 }}>
              <Button
                size="small"
                startIcon={<AddIcon />}
                disabled={adding}
                onClick={() => onAdd("pattern")}
                sx={{ fontSize: 11, color: "primary.main", "&:hover": { bgcolor: "#fff0ef" } }}
              >
                Add Pattern
              </Button>
            </Box>
          </Box>
        )}

        {/* Materials candidates */}
        {garment.materials_candidates?.length ? (
          <Box>
            <Typography sx={{ fontSize: 11, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.1em", mb: 1 }}>Materials</Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
              {garment.materials_candidates.map((m) => (
                <Chip key={m} label={m} size="small" sx={{ fontSize: 11, bgcolor: "#faf8f7", borderColor: "#f0e4e2" }} variant="outlined" />
              ))}
            </Box>
          </Box>
        ) : null}
      </Box>
    </Paper>
  );
}
