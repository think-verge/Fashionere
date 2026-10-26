import { useState } from "react";
import { Box, Button, Chip, Dialog, IconButton, Skeleton, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import CloseIcon from "@mui/icons-material/Close";
import { api } from "../../lib/api/client";
import { ConceptImage } from "../../components/ConceptImage";
import { variationName, variationsQueryKey } from "./stage3Shared";

// Compare the Stage 2 variations of the garment in focus, on the same model, side by side. A variation without a
// shoot is made by re-dressing the focused garment's photograph in it (same model, pose, outfit and light), so the
// only difference between columns is the garment.

interface VariationImage { id: string; view: string | null; status: string; image_url: string | null }
interface VariationShoot {
  id: string;
  status: "generating" | "ready" | "failed";
  approved_main_id: string | null;
  main: { current: VariationImage | null; versions: VariationImage[] };
  shots: VariationImage[];
}
interface Variation { concept_id: string; accumulated_edits: string[]; finalized: boolean; shoot: VariationShoot | null }

type Mode = "main" | "detail" | "back";
const MODE_LABEL: Record<Mode, string> = { main: "Main image", detail: "Detail shot", back: "Back" };

function imageFor(v: Variation, mode: Mode): VariationImage | null {
  const s = v.shoot;
  if (!s) return null;
  if (mode === "main") {
    return s.main.versions.find((m) => m.id === s.approved_main_id && m.image_url) ?? s.main.current;
  }
  const view = mode === "detail" ? "close_detail" : "back";
  return s.shots.find((x) => x.view === view && x.image_url) ?? null;
}

export function CompareVariations({ open, onClose, focusId, focusShootId, modelConfig, outfit, costPerImage, onFocus }: {
  open: boolean;
  onClose: () => void;
  focusId: string;
  /** The focused garment's shoot: variations are shot on the same model (same face and body). */
  focusShootId: string | null;
  modelConfig: Record<string, string> | null;
  outfit: Record<string, string> | null;
  costPerImage: number;
  onFocus: (conceptId: string) => void;
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>("main");
  const [error, setError] = useState<string | null>(null);
  const key = variationsQueryKey(focusId);

  const { data, isLoading } = useQuery<{ variations: Variation[] }>({
    queryKey: key,
    queryFn: async () => (await api.get("/model-shoots/variations", { params: { concept_id: focusId } })).data,
    enabled: open,
    refetchInterval: (q) => (q.state.data?.variations.some((v) => v.shoot?.status === "generating") ? 4000 : false),
  });
  const variations = data?.variations ?? [];

  const fail = (err: unknown) => {
    const e = err as { response?: { data?: { detail?: string } } };
    setError(e.response?.data?.detail ?? "Something went wrong. Try again.");
  };
  const shoot = useMutation({
    mutationFn: (conceptId: string) =>
      api.post(`/concepts/${conceptId}/model-shoot`, {
        model_config: modelConfig ?? undefined,
        outfit: outfit ?? undefined,
        identity_from_shoot: focusShootId ?? undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: fail,
  });
  // Focusing a variation that is not in Stage 3 yet adds it (finalises it) first.
  const focus = useMutation({
    mutationFn: async (v: Variation) => {
      if (!v.finalized) await api.post(`/concepts/${v.concept_id}/finalize`);
      return v.concept_id;
    },
    onSuccess: async (conceptId) => {
      await qc.invalidateQueries({ queryKey: ["model-shoots"] });
      onFocus(conceptId);
      onClose();
    },
    onError: fail,
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg" slotProps={{ paper: { sx: { borderRadius: "20px", p: { xs: 2, md: 3 }, bgcolor: "#faf7f6" } } }}>
      <Box sx={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 2, flexWrap: "wrap", mb: 2.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "#8a817e" }}>Compare variations</Typography>
          <Typography sx={{ fontFamily: "'Literata', Georgia, serif", fontSize: { xs: 24, md: 30 }, my: 0.5 }}>Same model, different variations</Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Every variation of this garment from Stage 2 on the same model, in the same pose and outfit, so only the garment differs. Choose the one to take forward.</Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, m: Mode | null) => m && setMode(m)} aria-label="What to compare">
            {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
              <ToggleButton key={m} value={m} sx={{ textTransform: "none", fontSize: 12, px: 1.5 }}>{MODE_LABEL[m]}</ToggleButton>
            ))}
          </ToggleButtonGroup>
          <IconButton aria-label="Close" onClick={onClose} size="small"><CloseIcon fontSize="small" /></IconButton>
        </Box>
      </Box>

      {isLoading ? (
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 2 }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" sx={{ aspectRatio: "3/4", height: "auto", borderRadius: "16px" }} />)}
        </Box>
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(auto-fit, minmax(240px, 1fr))" }, gap: 2 }}>
          {variations.map((v) => {
            const inFocus = v.concept_id === focusId;
            const img = imageFor(v, mode);
            const generating = v.shoot?.status === "generating";
            return (
              <Box key={v.concept_id} sx={{ display: "flex", flexDirection: "column", borderRadius: "16px", overflow: "hidden", bgcolor: "#fff", border: inFocus ? "2px solid #000" : "1px solid #ecdedb" }}>
                <Box sx={{ display: "flex", gap: 1.25, alignItems: "center", p: 1.5, borderBottom: "1px solid #f3ebe9", minHeight: 68 }}>
                  <Box sx={{ width: 42, height: 42, flexShrink: 0, borderRadius: "6px", overflow: "hidden", border: "1px solid #f0e4e2", bgcolor: "#fff" }}>
                    <ConceptImage conceptId={v.concept_id} sx={{ objectFit: "contain" }} />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, lineHeight: 1.25 }}>{variationName(v)}</Typography>
                    <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>{v.finalized ? "In Stage 3" : "Stage 2 variation"}</Typography>
                  </Box>
                </Box>

                <Box sx={{ position: "relative", aspectRatio: "3/4", maxWidth: "100%", bgcolor: "#f5f0ef" }}>
                  {img?.image_url ? (
                    <Box component="img" src={img.image_url} alt={`${variationName(v)} on the model`} sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  ) : generating ? (
                    <>
                      <Skeleton variant="rectangular" animation="wave" sx={{ position: "absolute", inset: 0, height: "100%" }} />
                      <Typography sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 12, color: "text.secondary" }}>Generating…</Typography>
                    </>
                  ) : (
                    <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", p: 3 }}>
                      {v.shoot ? (
                        <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>No {MODE_LABEL[mode].toLowerCase()} for this variation yet.</Typography>
                      ) : (
                        <Box>
                          <Typography sx={{ fontSize: 12.5, color: "text.secondary", mb: 1.5 }}>Dress the model from the garment in focus in this variation: same pose, outfit and light.</Typography>
                          <Button variant="outlined" size="small" disabled={shoot.isPending} onClick={() => shoot.mutate(v.concept_id)}
                            sx={{ borderRadius: "8px", textTransform: "none", color: "text.primary", borderColor: "#e6d9d6", bgcolor: "#fff" }}>
                            Try it on · ${costPerImage.toFixed(2)}
                          </Button>
                        </Box>
                      )}
                    </Box>
                  )}
                </Box>

                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, p: 1.5, flexWrap: "wrap" }}>
                  <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                    {!v.shoot ? "Not shot yet" : generating ? "Generating" : `${v.shoot.approved_main_id ? "Approved" : "Main image"} · ${v.shoot.shots.filter((s) => s.image_url).length} shots`}
                  </Typography>
                  {inFocus ? (
                    <Chip label="In focus" size="small" sx={{ bgcolor: "#000", color: "#fff", fontSize: 11, height: 22 }} />
                  ) : (
                    <Button size="small" variant="outlined" disabled={focus.isPending} onClick={() => focus.mutate(v)}
                      sx={{ borderRadius: "8px", textTransform: "none", color: "text.primary", borderColor: "#e6d9d6" }}>
                      {v.finalized ? "Focus this variation" : "Add to Stage 3 and focus"}
                    </Button>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
      {error && <Typography sx={{ mt: 2, fontSize: 12.5, color: "#c62828" }}>{error}</Typography>}
    </Dialog>
  );
}
