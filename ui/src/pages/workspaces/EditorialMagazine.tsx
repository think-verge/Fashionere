import { useState } from "react";
import { Box, Button, CircularProgress, Dialog, IconButton, Snackbar, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import CloseIcon from "@mui/icons-material/Close";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { api } from "../../lib/api/client";
import { ConceptImage } from "../../components/ConceptImage";

// The final step: the collection as a magazine editorial — one spread per look, laid out like a printed
// designer feature (masthead, hero + designer's note, collage of on-model shots and flats, pull quote, credits).

interface EditorialCopy { look_name: string; title: string; statement: string[]; pull_quote: string; fabric?: string; palette?: string }
interface ShootImage { id: string; status: string; image_url: string | null; title: string | null; view: string | null }
interface Shoot {
  id: string;
  approved_main_id: string | null;
  colours: { dominant: string; accents: string } | null;
  main: { versions: ShootImage[] };
  shots: ShootImage[];
  editorial: EditorialCopy | null;
}
interface ShootGarment { concept_id: string; garment_type: string; fabric: string; shoot: Shoot | null }
interface PackShot { slot: string; current: { status: string; image_url: string | null; caption: string | null } | null }
interface PackGarment { concept_id: string; pack: { shots: PackShot[] } | null }

const C = {
  bg: "#faf9f5", ink: "#141413", text: "#1c1a17", secondary: "#4a4642", muted: "#8a857d",
  border: "rgba(20,20,19,.12)", surface: "#f3f1ea",
};
const VOICE = "'Playfair Display', 'Didot', 'Bodoni 72', Georgia, serif";
const BODY = "'Work Sans', 'Helvetica Neue', system-ui, sans-serif";
const MONO = "'SF Mono', ui-monospace, Menlo, monospace";
const VIEW_LABEL: Record<string, string> = { front: "Front", three_quarter: "Three-quarter", side: "Profile", back: "Back", close_detail: "Detail" };

const eyebrow = { fontFamily: BODY, fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: C.muted } as const;

/** A look is ready for the editorial once its main image is approved. */
function heroOf(s: Shoot | null) {
  if (!s?.approved_main_id) return null;
  return s.main.versions.find((v) => v.id === s.approved_main_id && v.image_url) ?? null;
}

// ─── Entry point in Stage 3 ───────────────────────────────────────────────────

export function EditorialSection({ workspaceId, workspaceName }: { workspaceId?: string; workspaceName: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const shootsKey = ["model-shoots", workspaceId];
  const { data: shoots } = useQuery<{ garments: ShootGarment[] }>({
    queryKey: shootsKey,
    queryFn: async () => (await api.get("/model-shoots", { params: { workspace_id: workspaceId } })).data,
    enabled: !!workspaceId,
  });
  const { data: packs } = useQuery<{ garments: PackGarment[] }>({
    queryKey: ["garment-concepts", workspaceId],
    queryFn: async () => (await api.get("/garment-packs", { params: { workspace_id: workspaceId } })).data,
    enabled: !!workspaceId,
  });

  const looks = (shoots?.garments ?? []).filter((g) => heroOf(g.shoot));
  const missingCopy = looks.filter((g) => !g.shoot!.editorial);

  const write = useMutation({
    mutationFn: async (shootIds: string[]) => Promise.all(shootIds.map((id) => api.post(`/model-shoots/${id}/editorial`))),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: shootsKey });
      setOpen(true);
    },
    onError: () => setNotice("Couldn't write the editorial copy. Try again."),
  });

  const create = () => (missingCopy.length ? write.mutate(missingCopy.map((g) => g.shoot!.id)) : setOpen(true));

  return (
    <Box sx={{ mt: 6, pt: 4, borderTop: "1px solid #f0e4e2" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 2 }}>
        <Typography sx={{ fontSize: 18, color: "text.primary", fontFamily: "'Literata', Georgia, serif" }}>
          <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "Inter, sans-serif", letterSpacing: "0.05em", marginRight: "12px", color: "#999" }}>03</span>
          The editorial
        </Typography>
        <Typography sx={{ fontSize: 12, color: "text.secondary", letterSpacing: "0.05em", textTransform: "uppercase" }}>
          {looks.length} look{looks.length === 1 ? "" : "s"} ready
        </Typography>
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
        <Typography sx={{ fontSize: 13, color: "text.secondary", flex: 1, minWidth: 240 }}>
          {looks.length
            ? "Every look with an approved main image becomes a spread: the hero, a designer's note, the editorial shots and the flats."
            : "Approve a main image for at least one garment to create the editorial."}
        </Typography>
        <Button
          variant="contained"
          disableElevation
          disabled={!looks.length || write.isPending}
          startIcon={write.isPending ? <CircularProgress size={14} sx={{ color: "#fff" }} /> : <AutoAwesomeIcon fontSize="small" />}
          onClick={create}
          sx={{ borderRadius: "8px", textTransform: "none", bgcolor: "#000", color: "#fff", px: 2.5, "&:hover": { bgcolor: "#222" } }}
        >
          {write.isPending ? "Writing the designer's notes…" : missingCopy.length ? "Create the editorial" : "View the editorial"}
        </Button>
      </Box>

      <Dialog fullScreen open={open} onClose={() => setOpen(false)}>
        <EditorialMagazine
          workspaceName={workspaceName}
          looks={looks}
          packs={packs?.garments ?? []}
          onClose={() => setOpen(false)}
          onRewrite={(shootId) => write.mutateAsync([shootId]).then(() => undefined)}
        />
      </Dialog>
      <Snackbar open={!!notice} autoHideDuration={4000} onClose={() => setNotice(null)} message={notice} anchorOrigin={{ vertical: "bottom", horizontal: "center" }} />
    </Box>
  );
}

// ─── The magazine ─────────────────────────────────────────────────────────────

function EditorialMagazine({ workspaceName, looks, packs, onClose, onRewrite }: {
  workspaceName: string;
  looks: ShootGarment[];
  packs: PackGarment[];
  onClose: () => void;
  onRewrite: (shootId: string) => Promise<void>;
}) {
  const year = new Date().getFullYear();
  return (
    <Box sx={{ bgcolor: C.bg, color: C.text, fontFamily: BODY, minHeight: "100%" }}>
      <Box sx={{ position: "sticky", top: 0, zIndex: 2, bgcolor: "rgba(250,249,245,.92)", backdropFilter: "blur(8px)", borderBottom: `.5px solid ${C.border}` }}>
        <Box sx={{ maxWidth: 1160, mx: "auto", px: { xs: 2, md: 5 }, py: 1.5, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Typography sx={{ fontFamily: VOICE, fontSize: 17 }}>Fashionere</Typography>
          <IconButton aria-label="Close editorial" onClick={onClose} size="small"><CloseIcon fontSize="small" /></IconButton>
        </Box>
      </Box>

      <Box sx={{ maxWidth: 1160, mx: "auto", px: { xs: 2, md: 5 }, pt: 2, pb: 8 }}>
        <Box sx={{ borderTop: `.5px solid rgba(20,20,19,.26)`, borderBottom: `.5px solid ${C.border}`, py: 2.25, mt: 1.5, mb: 6, display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 1.5 }}>
          <Box>
            <Typography sx={eyebrow}>Fashionere — the editorial</Typography>
            <Typography component="h1" sx={{ fontFamily: VOICE, fontSize: { xs: 32, md: 44 }, lineHeight: 1, mt: 1, textWrap: "balance" }}>{workspaceName}</Typography>
          </Box>
          <Typography sx={{ ...eyebrow, textAlign: "right", lineHeight: 1.9 }}>
            {year}<br />{looks.length} look{looks.length === 1 ? "" : "s"}<br />Studio editorial
          </Typography>
        </Box>

        {looks.map((g, i) => (
          <LookSpread
            key={g.concept_id}
            index={i + 1}
            look={g}
            pack={packs.find((p) => p.concept_id === g.concept_id) ?? null}
            signature={`${workspaceName}, ${year}`}
            onRewrite={() => onRewrite(g.shoot!.id)}
          />
        ))}

        <Box sx={{ mt: 5, pt: 2, borderTop: `.5px solid ${C.border}`, display: "flex", justifyContent: "space-between", gap: 1.5, flexWrap: "wrap", fontSize: 10.5, letterSpacing: ".06em", color: "#b7b1a6" }}>
          <span>Developed in the Fashionere AI builder · imagery generated</span>
          <span style={{ fontFamily: MONO }}>Fashionere</span>
        </Box>
      </Box>
    </Box>
  );
}

function LookSpread({ index, look, pack, signature, onRewrite }: {
  index: number;
  look: ShootGarment;
  pack: PackGarment | null;
  signature: string;
  onRewrite: () => Promise<void>;
}) {
  const shoot = look.shoot!;
  const hero = heroOf(shoot)!;
  const copy = shoot.editorial;
  const [rewriting, setRewriting] = useState(false);
  const shots = shoot.shots.filter((s) => s.status === "generated" && s.image_url);
  const packShot = (slot: string) => pack?.pack?.shots.find((s) => s.slot === slot)?.current;
  const back = packShot("back_flat");
  const closeups = ["closeup_1", "closeup_2"].map(packShot).filter((s) => s?.status === "generated" && s.image_url);
  const garmentWord = look.garment_type || "garment";
  // Credits come from the copy (read from the photograph); Stage 1 labels are only a fallback.
  const fabric = copy?.fabric || look.fabric;
  const palette = copy?.palette || shoot.colours?.dominant || null;

  const rewrite = async () => {
    setRewriting(true);
    try { await onRewrite(); } finally { setRewriting(false); }
  };

  return (
    <Box component="section" sx={{ mb: 9 }}>
      {/* Masthead */}
      <Box sx={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 1.75, borderBottom: `1px solid ${C.ink}`, pb: 1.75, mb: 2.75 }}>
        <Typography sx={{ fontFamily: VOICE, fontSize: { xs: 52, md: 104 }, lineHeight: 0.82, letterSpacing: ".01em" }}>
          {copy?.look_name ?? `Look ${String(index).padStart(2, "0")}`}
        </Typography>
        <Box sx={{ textAlign: "right" }}>
          <Typography sx={{ ...eyebrow, lineHeight: 1.9 }}>
            Look {String(index).padStart(2, "0")} — {copy?.title ?? `The ${garmentWord}`}<br />
            {garmentWord}<br />{fabric}
          </Typography>
          <Button size="small" onClick={rewrite} disabled={rewriting} sx={{ mt: 0.5, p: 0, minWidth: 0, fontSize: 10.5, letterSpacing: ".1em", color: C.muted, textTransform: "uppercase" }}>
            {rewriting ? "Rewriting…" : "Rewrite copy"}
          </Button>
        </Box>
      </Box>

      {/* Collage */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(6, 1fr)" }, gap: 1.5, gridAutoFlow: "dense" }}>
        <Tile src={hero.image_url!} label="Hero" span={3} ratio="3/4" />
        <Box sx={{ gridColumn: { xs: "span 2", md: "span 3" }, bgcolor: C.surface, border: `.5px solid ${C.border}`, borderRadius: "2px", p: { xs: 2.5, md: 3.25 }, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <Typography sx={{ ...eyebrow, fontSize: 10, mb: 1.5 }}>The designer, introducing</Typography>
          {copy ? (
            <>
              {copy.statement.map((p, i) => (
                <Typography key={i} sx={{ fontFamily: VOICE, fontSize: 16, lineHeight: 1.62, mb: 1.5, maxWidth: "60ch" }}>{p}</Typography>
              ))}
              <Typography sx={{ fontFamily: VOICE, fontStyle: "italic", color: C.secondary, fontSize: 13, mt: 1 }}>— {signature}</Typography>
            </>
          ) : (
            <Typography sx={{ fontSize: 13, color: C.muted }}>The designer's note hasn't been written yet — use “Rewrite copy”.</Typography>
          )}
        </Box>

        {shots.map((s) => (
          <Tile key={s.id} src={s.image_url!} label={(s.view && VIEW_LABEL[s.view]) || "Editorial"} span={2} ratio="3/4" />
        ))}
        <Box sx={{ gridColumn: { xs: "span 1", md: "span 2" }, aspectRatio: "1/1", position: "relative", overflow: "hidden", border: `.5px solid ${C.border}`, borderRadius: "2px", bgcolor: "#fff" }}>
          <ConceptImage conceptId={look.concept_id} sx={{ objectFit: "contain" }} />
          <TileLabel text="Flat" />
        </Box>
        {back?.status === "generated" && back.image_url && <Tile src={back.image_url} label="Back" span={2} ratio="1/1" contain />}
        {closeups.map((c, i) => (
          <Tile key={i} src={c!.image_url!} label={(c!.caption ?? "Detail").split(" · ")[0]} span={2} ratio="1/1" />
        ))}
      </Box>

      {/* Pull quote */}
      {copy?.pull_quote && (
        <Box sx={{ borderTop: `1px solid ${C.ink}`, borderBottom: `1px solid ${C.ink}`, py: 4.25, my: 3.25, textAlign: "center" }}>
          <Typography sx={{ fontFamily: VOICE, fontStyle: "italic", fontSize: { xs: 22, md: 34 }, lineHeight: 1.25, maxWidth: "22ch", mx: "auto", textWrap: "balance" }}>
            {copy.pull_quote}
          </Typography>
        </Box>
      )}

      {/* Credits */}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2.75, justifyContent: "space-between", ...eyebrow, borderTop: `.5px solid ${C.border}`, pt: 2 }}>
        <span>Look {String(index).padStart(2, "0")} · {copy?.title ?? garmentWord}</span>
        {palette && <span>Palette · {palette}</span>}
        <span>Fabric · {fabric}</span>
        <span>Imagery · Fashionere AI</span>
      </Box>
    </Box>
  );
}

function TileLabel({ text }: { text: string }) {
  return (
    <Box component="span" sx={{ position: "absolute", bottom: 8, left: 9, fontFamily: MONO, fontSize: 9, letterSpacing: ".06em", color: "#fff", bgcolor: "rgba(0,0,0,.4)", px: 0.75, py: 0.25, borderRadius: "2px" }}>
      {text}
    </Box>
  );
}

function Tile({ src, label, span, ratio, contain }: { src: string; label: string; span: 2 | 3; ratio: string; contain?: boolean }) {
  // On phones the collage is two columns: the hero spans both, everything else sits two-up.
  return (
    <Box sx={{ gridColumn: { xs: span === 3 ? "span 2" : "span 1", md: `span ${span}` }, aspectRatio: ratio, position: "relative", overflow: "hidden", border: `.5px solid ${C.border}`, borderRadius: "2px", bgcolor: contain ? "#fff" : C.surface }}>
      <Box component="img" src={src} alt={label} loading="lazy" sx={{ width: "100%", height: "100%", objectFit: contain ? "contain" : "cover", display: "block" }} />
      <TileLabel text={label} />
    </Box>
  );
}
