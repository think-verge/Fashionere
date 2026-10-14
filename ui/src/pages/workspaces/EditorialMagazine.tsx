import { useState } from "react";
import { Box, Button, Chip, CircularProgress, Dialog, IconButton, Snackbar, Typography } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import CloseIcon from "@mui/icons-material/Close";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { api } from "../../lib/api/client";
import { variationName } from "./stage3Shared";

// The editorial: one magazine feature per garment, built from the garment in focus. The copy is written by a writer
// agent and rewritten by an editor agent — third person, flowing paragraphs, about the product only.

export interface EditorialFigure { caption: string; image_url: string }
export interface Editorial {
  look_name: string;
  headline: string;
  standfirst: string;
  hero_caption: string;
  opening: string[];
  pull_quote: string;
  details: EditorialFigure[];
  closing: string[];
  shots: EditorialFigure[];
  credit_line: string;
  fabric: string;
  palette: string;
  generated_at: string;
}
export interface EditorialGarment {
  concept_id: string;
  garment_type: string;
  accumulated_edits: string[];
  shoot: {
    id: string;
    approved_main_id: string | null;
    main: { versions: Array<{ id: string; image_url: string | null }> };
    editorial: Editorial | null;
  } | null;
}

const C = { bg: "#faf9f5", ink: "#141413", text: "#2a2723", muted: "#8a857d", caption: "#6b665f", border: "rgba(20,20,19,.12)", surface: "#f3f1ea" };
const VOICE = "'Playfair Display', 'Didot', 'Bodoni 72', Georgia, serif";
const BODY = "'Work Sans', 'Helvetica Neue', system-ui, sans-serif";
const MONO = "'SF Mono', ui-monospace, Menlo, monospace";
const eyebrow = { fontFamily: BODY, fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: C.muted } as const;

const titleCase = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : "Garment");

function heroUrl(g: EditorialGarment) {
  const s = g.shoot;
  return s?.approved_main_id ? s.main.versions.find((v) => v.id === s.approved_main_id)?.image_url ?? null : null;
}

function errorMessage(err: unknown) {
  const e = err as { response?: { data?: { detail?: string; error?: string } } };
  return e.response?.data?.detail ?? e.response?.data?.error ?? "The editorial couldn't be written. Try again.";
}

// ─── The card in Stage 3, for the garment in focus ────────────────────────────

export function EditorialCard({ garment, others, workspaceName, onChanged, onFocus }: {
  garment: EditorialGarment;
  others: EditorialGarment[];
  workspaceName: string;
  onChanged: () => Promise<unknown>;
  onFocus: (conceptId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const hero = heroUrl(garment);
  const editorial = garment.shoot?.editorial ?? null;

  const write = useMutation({
    mutationFn: () => api.post(`/model-shoots/${garment.shoot!.id}/editorial`),
    onSuccess: async () => { await onChanged(); setOpen(true); },
    onError: (err) => setNotice(errorMessage(err)),
  });

  const name = `${titleCase(garment.garment_type)} · ${variationName(garment)}`;
  return (
    <Box sx={{ mb: 4 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 3 }}>
        <Typography sx={{ fontSize: 18, color: "text.primary", fontFamily: "'Literata', Georgia, serif" }}>
          <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "Inter, sans-serif", letterSpacing: "0.05em", marginRight: "12px", color: "#999" }}>03</span>
          Editorial
        </Typography>
        <Typography sx={{ fontSize: 12, color: "text.secondary", letterSpacing: "0.05em", textTransform: "uppercase" }}>one per garment</Typography>
      </Box>
      <Box sx={{ display: "flex", gap: 2.5, alignItems: "center", flexWrap: "wrap", p: { xs: 2, md: 2.5 }, borderRadius: "16px", bgcolor: "#fff", border: "1px solid #ecdedb" }}>
        <Box sx={{ flex: 1, minWidth: 240 }}>
          <Typography sx={{ fontFamily: "'Literata', Georgia, serif", fontSize: 18, mb: 0.5 }}>
            {editorial ? editorial.headline : `Editorial for ${name}`}
          </Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary", lineHeight: 1.5 }}>
            {!hero
              ? "Approve a main image for this garment to create its editorial."
              : editorial
                ? `A magazine feature on ${name}, written ${new Date(editorial.generated_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}.`
                : "A magazine feature on this garment alone: its hero image, the story of the piece, its details and its shots."}
          </Typography>
          {others.length > 0 && (
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1.25 }}>
              {others.map((o) => (
                <Chip
                  key={o.concept_id}
                  size="small"
                  variant="outlined"
                  onClick={() => onFocus(o.concept_id)}
                  label={`${variationName(o)} · ${o.shoot?.editorial ? "editorial ready" : "no editorial yet"}`}
                  sx={{ fontSize: 11.5, borderColor: "#ecdedb", color: "#5f5755", bgcolor: "#fbf8f7", maxWidth: 320 }}
                />
              ))}
            </Box>
          )}
        </Box>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {editorial && (
            <Button variant="outlined" disabled={write.isPending} onClick={() => setOpen(true)} sx={{ borderRadius: "8px", textTransform: "none", color: "text.primary", borderColor: "#f0e4e2" }}>
              Open editorial
            </Button>
          )}
          <Button
            variant="contained"
            disableElevation
            disabled={!hero || write.isPending}
            onClick={() => write.mutate()}
            startIcon={write.isPending ? <CircularProgress size={14} sx={{ color: "#fff" }} /> : <AutoAwesomeIcon fontSize="small" />}
            sx={{ borderRadius: "8px", textTransform: "none", bgcolor: "#000", color: "#fff", px: 2.5, "&:hover": { bgcolor: "#222" } }}
          >
            {write.isPending ? "Writing the feature… about a minute" : editorial ? "Rewrite" : "Create editorial for this garment"}
          </Button>
        </Box>
      </Box>

      <Dialog fullScreen open={open && !!editorial && !!hero} onClose={() => setOpen(false)}>
        {editorial && hero && (
          <EditorialView
            editorial={editorial}
            heroUrl={hero}
            garmentType={garment.garment_type}
            variation={variationName(garment)}
            workspaceName={workspaceName}
            rewriting={write.isPending}
            onRewrite={() => write.mutate()}
            onClose={() => setOpen(false)}
          />
        )}
      </Dialog>
      <Snackbar open={!!notice} autoHideDuration={5000} onClose={() => setNotice(null)} message={notice} anchorOrigin={{ vertical: "bottom", horizontal: "center" }} />
    </Box>
  );
}

// ─── The feature ──────────────────────────────────────────────────────────────

function EditorialView({ editorial: e, heroUrl, garmentType, variation, workspaceName, rewriting, onRewrite, onClose }: {
  editorial: Editorial;
  heroUrl: string;
  garmentType: string;
  variation: string;
  workspaceName: string;
  rewriting: boolean;
  onRewrite: () => void;
  onClose: () => void;
}) {
  const year = new Date(e.generated_at).getFullYear();
  const prose = { fontFamily: VOICE, fontSize: 16.5, lineHeight: 1.75, color: C.text, m: 0, mb: 2, maxWidth: "60ch" } as const;
  const captionSx = { fontFamily: VOICE, fontStyle: "italic", fontSize: 13, lineHeight: 1.45, color: C.caption, mt: 1 } as const;

  return (
    <Box sx={{ bgcolor: C.bg, color: C.ink, fontFamily: BODY, minHeight: "100%" }}>
      <Box sx={{ position: "sticky", top: 0, zIndex: 2, bgcolor: "rgba(250,249,245,.94)", backdropFilter: "blur(8px)", borderBottom: `.5px solid ${C.border}` }}>
        <Box sx={{ maxWidth: 1160, mx: "auto", px: { xs: 2, md: 5 }, py: 1.25, display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
          <Typography sx={{ fontFamily: VOICE, fontSize: 17 }}>Fashionere</Typography>
          <Typography sx={{ fontSize: 12, color: C.muted, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Editorial · {titleCase(garmentType)} · {variation}
          </Typography>
          <Button size="small" variant="outlined" onClick={onRewrite} disabled={rewriting} sx={{ textTransform: "none", borderRadius: "8px", color: C.ink, borderColor: C.border }}>
            {rewriting ? "Rewriting…" : "Rewrite copy"}
          </Button>
          <IconButton aria-label="Close editorial" size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
        </Box>
      </Box>

      <Box component="article" sx={{ maxWidth: 1160, mx: "auto", px: { xs: 2, md: 5 }, pt: 3, pb: 8 }}>
        {/* Masthead */}
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 2, borderBottom: `1px solid ${C.ink}`, pb: 1.75, mb: 4 }}>
          <Typography sx={{ fontFamily: VOICE, fontSize: { xs: 56, md: 112 }, lineHeight: 0.82, letterSpacing: ".005em" }}>{e.look_name}</Typography>
          <Typography sx={{ ...eyebrow, textAlign: "right", lineHeight: 1.95 }}>
            {workspaceName} · {year}<br />{titleCase(garmentType)}<br />{e.fabric}
          </Typography>
        </Box>

        {/* Headline and standfirst */}
        <Box component="header" sx={{ textAlign: "center", maxWidth: 720, mx: "auto", mb: 5 }}>
          <Typography sx={eyebrow}>{titleCase(garmentType)}</Typography>
          <Typography component="h1" sx={{ fontFamily: VOICE, fontSize: { xs: 34, md: 54 }, lineHeight: 1.05, my: 1.5, textWrap: "balance" }}>{e.headline}</Typography>
          <Typography sx={{ fontFamily: VOICE, fontStyle: "italic", fontSize: { xs: 17, md: 21 }, lineHeight: 1.5, color: "#4a4642", maxWidth: "46ch", mx: "auto", textWrap: "balance" }}>
            {e.standfirst}
          </Typography>
        </Box>

        {/* Opening spread */}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: { xs: 3, md: 5 }, alignItems: "start" }}>
          <Box component="figure" sx={{ m: 0 }}>
            <Figure src={heroUrl} alt={e.headline} ratio="3/4" />
            <Typography component="figcaption" sx={captionSx}>{e.hero_caption}</Typography>
          </Box>
          <Box sx={{ minWidth: 0 }}>
            {e.opening.map((p, i) => (
              <Typography
                key={i}
                sx={{
                  ...prose,
                  ...(i === 0 && { "&::first-letter": { float: "left", fontSize: "4.1em", lineHeight: 0.82, pt: "6px", pr: "10px", color: C.ink } }),
                }}
              >
                {p}
              </Typography>
            ))}
          </Box>
        </Box>

        {/* Pull quote */}
        <Box sx={{ borderTop: `1px solid ${C.ink}`, borderBottom: `1px solid ${C.ink}`, py: 4, my: 4.5, textAlign: "center" }}>
          <Typography sx={{ fontFamily: VOICE, fontStyle: "italic", fontSize: { xs: 22, md: 34 }, lineHeight: 1.25, maxWidth: "24ch", mx: "auto", textWrap: "balance" }}>
            {e.pull_quote}
          </Typography>
        </Box>

        {/* Details, cut from the flat */}
        {e.details.length > 0 && (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: `repeat(${Math.min(4, e.details.length)}, 1fr)` }, gap: 1.75, mb: 5 }}>
            {e.details.map((d, i) => (
              <Box component="figure" key={i} sx={{ m: 0 }}>
                <Figure src={d.image_url} alt={d.caption} ratio="1/1" contain />
                <Typography component="figcaption" sx={captionSx}>{d.caption}</Typography>
              </Box>
            ))}
          </Box>
        )}

        {/* Closing spread */}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: e.shots.length ? "1fr 1fr" : "1fr" }, gap: { xs: 3, md: 5 }, alignItems: "start" }}>
          <Box sx={{ minWidth: 0, order: { xs: 2, md: 1 } }}>
            {e.closing.map((p, i) => <Typography key={i} sx={prose}>{p}</Typography>)}
            <Typography sx={{ ...prose, fontStyle: "italic", fontSize: 14, color: C.caption, borderTop: `.5px solid rgba(20,20,19,.2)`, pt: 1.75 }}>
              {e.credit_line}
            </Typography>
          </Box>
          {e.shots.length > 0 && (
            <Box sx={{ display: "grid", gridTemplateColumns: `repeat(${e.shots.length}, 1fr)`, gap: 1.5, order: { xs: 1, md: 2 } }}>
              {e.shots.map((s, i) => (
                <Box component="figure" key={i} sx={{ m: 0 }}>
                  <Figure src={s.image_url} alt={s.caption} ratio="3/4" />
                  <Typography component="figcaption" sx={captionSx}>{s.caption}</Typography>
                </Box>
              ))}
            </Box>
          )}
        </Box>

        <Box sx={{ mt: 5, pt: 2, borderTop: `.5px solid ${C.border}`, display: "flex", flexWrap: "wrap", gap: 2.5, justifyContent: "space-between", ...eyebrow }}>
          <span>Fashionere · The editorial</span>
          <span>{e.look_name} · {e.palette}</span>
          <span style={{ fontFamily: MONO, letterSpacing: ".04em" }}>Imagery generated in studio</span>
        </Box>
      </Box>
    </Box>
  );
}

function Figure({ src, alt, ratio, contain }: { src: string; alt: string; ratio: string; contain?: boolean }) {
  return (
    <Box sx={{ aspectRatio: ratio, maxWidth: "100%", overflow: "hidden", border: `.5px solid ${C.border}`, borderRadius: "2px", bgcolor: contain ? "#fff" : C.surface }}>
      <Box component="img" src={src} alt={alt} loading="lazy" sx={{ width: "100%", height: "100%", objectFit: contain ? "contain" : "cover", display: "block" }} />
    </Box>
  );
}
