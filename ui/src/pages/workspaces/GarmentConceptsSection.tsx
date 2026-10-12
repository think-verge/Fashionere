import { useEffect, useMemo, useState } from "react";
import {
  Box, Typography, IconButton, Skeleton, Chip, Dialog, Tooltip, Menu, MenuItem, Select, Snackbar, Button,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloseIcon from "@mui/icons-material/Close";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import RefreshIcon from "@mui/icons-material/Refresh";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { api } from "../../lib/api/client";

type Slot = "flat_lay" | "back_flat" | "closeup_1" | "closeup_2";
type ShotStatus = "pending" | "generating" | "generated" | "failed";

interface ShotVersion {
  id: string;
  slot: Slot;
  version: number;
  is_current: boolean;
  status: ShotStatus;
  caption: string | null;
  image_url: string | null;
}

interface GarmentPack {
  id: string;
  status: "generating" | "ready" | "partial" | "failed";
  shots: Array<{ slot: Slot; current: ShotVersion | null; versions: ShotVersion[] }>;
}

interface Garment {
  concept_id: string;
  garment_type: string;
  accumulated_edits: string[];
  front_image_url: string;
  pack: GarmentPack | null;
}

interface GarmentList {
  workspace_stream_url: string;
  garments: Garment[];
}

/** One frame in the lightbox / mini strip: the reused front flat or a generated shot. */
interface Frame {
  key: string;
  caption: string;
  status: ShotStatus;
  imageUrl: string | null;
  slot?: Slot;
  versions?: ShotVersion[];
  currentId?: string;
}

const SLOT_LABEL: Record<Slot, string> = {
  flat_lay: "Flat-lay",
  back_flat: "Back flat",
  closeup_1: "Close-up",
  closeup_2: "Close-up",
};
// Generated views; the front is the refined step-2 image itself. ("flat_lay" survives only in older packs.)
const SLOT_ORDER: Slot[] = ["back_flat", "closeup_1", "closeup_2"];
const BORDER = "#f0e4e2";
const GROUND = "#f5f0ef";

function framesFor(g: Garment): Frame[] {
  const front: Frame = { key: "front", caption: "Front flat", status: "generated", imageUrl: g.front_image_url };
  const shots = SLOT_ORDER.map((slot): Frame => {
    const s = g.pack?.shots.find((x) => x.slot === slot);
    const cur = s?.current;
    return {
      key: slot,
      slot,
      caption: cur?.caption || SLOT_LABEL[slot],
      status: cur?.status ?? "pending",
      imageUrl: cur?.status === "generated" ? cur.image_url : null,
      versions: s?.versions ?? [],
      currentId: cur?.id,
    };
  });
  return [front, ...shots];
}

function packProgress(g: Garment) {
  const shots = g.pack?.shots.map((s) => s.current) ?? [];
  const done = shots.filter((s) => s?.status === "generated").length;
  const failed = shots.filter((s) => s?.status === "failed").length;
  const notStarted = !g.pack;
  const generating = !notStarted && shots.some((s) => !s || s.status === "pending" || s.status === "generating");
  return { done, failed, generating, notStarted, total: SLOT_ORDER.length };
}

function titleFor(g: Garment) {
  const t = g.garment_type || "Garment";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function subtitleFor(g: Garment) {
  return g.accumulated_edits.length ? g.accumulated_edits[g.accumulated_edits.length - 1] : "Original concept";
}

// ─── Section ──────────────────────────────────────────────────────────────────

export function GarmentConceptsSection({ workspaceId }: { workspaceId?: string }) {
  const qc = useQueryClient();
  const queryKey = useMemo(() => ["garment-concepts", workspaceId], [workspaceId]);
  const [lightbox, setLightbox] = useState<{ g: number; f: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, isLoading } = useQuery<GarmentList>({
    queryKey,
    queryFn: async () => (await api.get("/garment-packs", { params: { workspace_id: workspaceId } })).data,
    enabled: !!workspaceId,
    // Safety net if the live stream drops (e.g. backend restart): poll while anything is generating.
    refetchInterval: (q) => (q.state.data?.garments.some((g) => packProgress(g).generating) ? 5000 : false),
  });
  const garments = data?.garments ?? [];

  const streamUrl = data?.workspace_stream_url;
  useEffect(() => {
    if (!streamUrl) return;
    const token = localStorage.getItem("fash_token") ?? "";
    const es = new EventSource(`/api/v1${streamUrl}?token=${encodeURIComponent(token)}`);
    const refresh = () => qc.invalidateQueries({ queryKey });
    for (const ev of ["regions_ready", "shot_ready", "shot_failed", "pack_done"]) es.addEventListener(ev, refresh);
    return () => es.close();
  }, [streamUrl, qc, queryKey]);

  const remove = useMutation({
    mutationFn: async (conceptId: string) => (await api.delete(`/concepts/${conceptId}/finalize`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["concepts", workspaceId] });
    },
  });

  // For garments finalised without a pack (e.g. a failed start): first-time generation, not regeneration.
  const generate = useMutation({
    mutationFn: async (conceptId: string) => (await api.post(`/concepts/${conceptId}/garment-pack`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: () => setNotice("Couldn't start generating these shots. Try again."),
  });

  const selectVersion = useMutation({
    mutationFn: async ({ packId, shotId }: { packId: string; shotId: string }) =>
      (await api.post(`/garment-packs/${packId}/shots/${shotId}/select`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const regenerateSoon = () => setNotice("Regeneration is coming soon.");

  return (
    <Box sx={{ mb: 4 }}>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 2, mb: 1 }}>
        <Typography sx={{ fontSize: 20, color: "text.primary", fontFamily: "'Literata', Georgia, serif" }}>
          <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "Inter, sans-serif", letterSpacing: "0.05em", marginRight: "12px", color: "#999" }}>03</span>
          Garment concepts
        </Typography>
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
          {garments.length ? `${garments.length} garment${garments.length > 1 ? "s" : ""} · realistic · no model` : "realistic · no model"}
        </Typography>
      </Box>

      {isLoading ? (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3, pb: 3, pt: 2, px: 2 }}>
          {[0, 1, 2].map((i) => (
            <Box key={i} sx={{ width: 300, flexShrink: 0 }}>
              <Skeleton variant="rounded" sx={{ width: "100%", aspectRatio: "4/5", height: "auto", borderRadius: "24px" }} />
            </Box>
          ))}
        </Box>
      ) : garments.length === 0 ? (
        <Box sx={{ height: 200, border: "1.5px dashed #e8dedd", borderRadius: "16px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, bgcolor: "#faf8f7" }}>
          <Typography sx={{ fontSize: 13, color: "text.disabled", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            No garment concepts yet
          </Typography>
          <Typography sx={{ fontSize: 12, color: "text.disabled", textAlign: "center", px: 4 }}>
            Select refined designs in section 02 and move them here to see how they'd look in real life.
          </Typography>
        </Box>
      ) : (
        <>
          <Typography sx={{ fontSize: 11, color: "text.disabled", mb: 2, fontStyle: "italic" }}>Click a garment to view its shots.</Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3, pb: 3, pt: 2, px: 2 }}>
            {garments.map((g, gi) => (
              <Box key={g.concept_id} sx={{ width: 305, flexShrink: 0 }}>
                <GarmentCard
                  garment={g}
                  onOpen={(f) => setLightbox({ g: gi, f })}
                  onRemove={() => remove.mutate(g.concept_id)}
                  onRegenerateAll={regenerateSoon}
                  onGenerate={() => generate.mutate(g.concept_id)}
                />
              </Box>
            ))}
          </Box>
        </>
      )}

      {lightbox && garments[lightbox.g] && (
        <Lightbox
          garments={garments}
          position={lightbox}
          onMove={setLightbox}
          onClose={() => setLightbox(null)}
          onRegenerate={regenerateSoon}
          onSelectVersion={(packId, shotId) => selectVersion.mutate({ packId, shotId })}
        />
      )}

      <Snackbar open={!!notice} autoHideDuration={2500} onClose={() => setNotice(null)} message={notice} anchorOrigin={{ vertical: "bottom", horizontal: "center" }} />
    </Box>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function ShotImage({ frame, iconSize = 28 }: { frame: Frame; iconSize?: number }) {
  if (frame.status === "generated" && frame.imageUrl) {
    return <Box component="img" src={frame.imageUrl} alt={frame.caption} sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />;
  }
  if (frame.status === "failed") {
    return (
      <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "#fdf3f2" }}>
        <ErrorOutlineIcon sx={{ fontSize: iconSize, color: "#c62828" }} />
      </Box>
    );
  }
  return <Skeleton variant="rectangular" animation="pulse" sx={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />;
}

function StatusChip({ garment }: { garment: Garment }) {
  const { done, failed, generating, notStarted, total } = packProgress(garment);
  if (notStarted) return <Chip size="small" label="Shots not generated" sx={{ bgcolor: "#f1efe8", color: "#5f5e5a", fontSize: 11, height: 22 }} />;
  if (generating) return <Chip size="small" label={`Generating · ${done} of ${total}`} sx={{ bgcolor: "#fff4e0", color: "#8a5a00", fontSize: 11, height: 22 }} />;
  if (failed) return <Chip size="small" label={`${done} of ${total} · ${failed} failed`} sx={{ bgcolor: "#fdecea", color: "#b71c1c", fontSize: 11, height: 22 }} />;
  return <Chip size="small" label={`Ready · ${done} of ${total}`} sx={{ bgcolor: "#e8f5e9", color: "#1b5e20", fontSize: 11, height: 22 }} />;
}

function GarmentCard({ garment, onOpen, onRemove, onRegenerateAll, onGenerate }: {
  garment: Garment;
  onOpen: (frameIndex: number) => void;
  onRemove: () => void;
  onRegenerateAll: () => void;
  onGenerate: () => void;
}) {
  const frames = framesFor(garment);
  const { notStarted } = packProgress(garment);
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null);

  return (
    <Box
      onClick={() => onOpen(0)}
      sx={{
        borderRadius: "24px", overflow: "hidden", cursor: "pointer", bgcolor: "#fff",
        border: `1px solid ${BORDER}`, borderBottom: "3px solid #e8dedd", boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
        transition: "box-shadow 0.2s ease", "&:hover": { boxShadow: "0 0 0 2px #000" },
        "&:hover .gc-actions": { opacity: 1 },
      }}
    >
      <Box sx={{ position: "relative", aspectRatio: "6/5", bgcolor: GROUND, overflow: "hidden" }}>
        {notStarted ? (
          <Box sx={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1.5, px: 3 }}>
            <Typography sx={{ fontSize: 12, color: "text.secondary", textAlign: "center" }}>Shots for this design haven't been generated.</Typography>
            <Button
              size="small"
              variant="outlined"
              onClick={(e) => { e.stopPropagation(); onGenerate(); }}
              sx={{ borderRadius: "8px", color: "text.primary", borderColor: BORDER, textTransform: "none", bgcolor: "#fff" }}
            >
              Generate shots
            </Button>
          </Box>
        ) : (
          <ShotImage frame={frames[0]} iconSize={36} />
        )}
        <Chip label="Front flat" size="small" sx={{ position: "absolute", bottom: 12, left: 12, bgcolor: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 11, height: 22 }} />
        <IconButton
          className="gc-actions"
          size="small"
          aria-label="Garment actions"
          onClick={(e) => { e.stopPropagation(); setMenuEl(e.currentTarget); }}
          sx={{ position: "absolute", top: 12, right: 12, opacity: menuEl ? 1 : 0, transition: "opacity 0.15s", bgcolor: "rgba(255,255,255,0.9)", "&:hover": { bgcolor: "#fff" }, boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}
        >
          <MoreHorizIcon fontSize="small" />
        </IconButton>
        <Menu anchorEl={menuEl} open={!!menuEl} onClose={() => setMenuEl(null)} onClick={(e) => e.stopPropagation()}>
          <MenuItem onClick={() => { setMenuEl(null); onRegenerateAll(); }} sx={{ fontSize: 13 }}>Regenerate all shots</MenuItem>
          <MenuItem onClick={() => { setMenuEl(null); onRemove(); }} sx={{ fontSize: 13, color: "#c62828" }}>Remove from garment concepts</MenuItem>
        </Menu>
      </Box>

      <Box sx={{ display: "flex", gap: 0.75, px: 1.5, pt: 1.5 }}>
        {frames.slice(1).map((f, i) => (
          <Tooltip key={f.key} title={f.caption}>
            <Box
              onClick={(e) => { e.stopPropagation(); onOpen(i + 1); }}
              sx={{ position: "relative", flex: 1, aspectRatio: "1", borderRadius: "6px", overflow: "hidden", bgcolor: GROUND, border: `1px solid ${BORDER}` }}
            >
              <ShotImage frame={f} iconSize={14} />
            </Box>
          </Tooltip>
        ))}
      </Box>

      <Box sx={{ px: 2, pt: 1.5, pb: 2.5 }}>
        <Typography sx={{ 
          fontWeight: 600, fontSize: 14, mb: 0.5, color: "text.primary",
          minHeight: 42, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden"
        }}>
          {titleFor(garment)}
        </Typography>
        <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {subtitleFor(garment)}
        </Typography>
        <StatusChip garment={garment} />
      </Box>
    </Box>
  );
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({ garments, position, onMove, onClose, onRegenerate, onSelectVersion }: {
  garments: Garment[];
  position: { g: number; f: number };
  onMove: (p: { g: number; f: number }) => void;
  onClose: () => void;
  onRegenerate: () => void;
  onSelectVersion: (packId: string, shotId: string) => void;
}) {
  const garment = garments[position.g];
  const frames = framesFor(garment);
  const frame = frames[Math.min(position.f, frames.length - 1)];

  const frameCount = frames.length;
  const stepShot = (d: number) => onMove({ g: position.g, f: (position.f + d + frameCount) % frameCount });
  const stepGarment = (d: number) => onMove({ g: (position.g + d + garments.length) % garments.length, f: 0 });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const shot = (d: number) => onMove({ g: position.g, f: (position.f + d + frameCount) % frameCount });
      const garment = (d: number) => onMove({ g: (position.g + d + garments.length) % garments.length, f: 0 });
      if (e.key === "ArrowRight") shot(1);
      else if (e.key === "ArrowLeft") shot(-1);
      else if (e.key === "ArrowDown") garment(1);
      else if (e.key === "ArrowUp") garment(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onMove, position.g, position.f, frameCount, garments.length]);

  const versions = frame.versions ?? [];

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth slotProps={{ 
      paper: { 
        sx: { 
          borderRadius: "20px", p: 2.5,
          "&::-webkit-scrollbar": { display: "none" },
          msOverflowStyle: "none", scrollbarWidth: "none"
        } 
      } 
    }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, mb: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 600 }}>{titleFor(garment)}</Typography>
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
            {subtitleFor(garment)} · Garment {position.g + 1} of {garments.length} · Shot {position.f + 1} of {frames.length}
          </Typography>
        </Box>
        {garments.length > 1 && (
          <>
            <Button size="small" onClick={() => stepGarment(-1)} startIcon={<ChevronLeftIcon />} sx={{ color: "text.secondary", textTransform: "none" }}>Prev</Button>
            <Button size="small" onClick={() => stepGarment(1)} endIcon={<ChevronRightIcon />} sx={{ color: "text.secondary", textTransform: "none" }}>Next</Button>
          </>
        )}
        <IconButton aria-label="Close" onClick={onClose} size="small"><CloseIcon fontSize="small" /></IconButton>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <IconButton aria-label="Previous shot" onClick={() => stepShot(-1)} sx={{ border: `1px solid ${BORDER}` }}><ChevronLeftIcon /></IconButton>
        <Box sx={{ position: "relative", flex: 1, aspectRatio: "1", maxHeight: "62vh", borderRadius: "12px", overflow: "hidden", bgcolor: GROUND, mx: "auto" }}>
          {frame.status === "generated" && frame.imageUrl ? (
            <Box component="img" src={frame.imageUrl} alt={frame.caption} sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
          ) : frame.status === "failed" ? (
            <Box sx={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }}>
              <ErrorOutlineIcon sx={{ fontSize: 36, color: "#c62828" }} />
              <Typography sx={{ fontSize: 13, color: "#c62828" }}>This shot couldn't be generated.</Typography>
            </Box>
          ) : (
            <>
              <Skeleton variant="rectangular" sx={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
              <Typography sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "text.secondary" }}>
                Generating…
              </Typography>
            </>
          )}
        </Box>
        <IconButton aria-label="Next shot" onClick={() => stepShot(1)} sx={{ border: `1px solid ${BORDER}` }}><ChevronRightIcon /></IconButton>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mt: 2 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{frame.caption}</Typography>
        {versions.length > 1 && garment.pack && (
          <Select
            size="small"
            value={frame.currentId ?? ""}
            onChange={(e) => onSelectVersion(garment.pack!.id, e.target.value)}
            sx={{ fontSize: 12, minWidth: 150, borderRadius: "8px" }}
          >
            {versions.map((v) => (
              <MenuItem key={v.id} value={v.id} disabled={v.status !== "generated"} sx={{ fontSize: 12 }}>
                Version {v.version}{v.is_current ? " (current)" : ""}
              </MenuItem>
            ))}
          </Select>
        )}
        {frame.slot && (
          <Button size="small" variant="outlined" startIcon={<RefreshIcon />} onClick={onRegenerate}
            sx={{ borderRadius: "8px", color: "text.primary", borderColor: BORDER, textTransform: "none" }}>
            Regenerate
          </Button>
        )}
      </Box>

      <Box sx={{ display: "flex", gap: 1, justifyContent: "center", mt: 2 }}>
        {frames.map((f, i) => (
          <Tooltip key={f.key} title={f.caption}>
            <Box
              onClick={() => onMove({ g: position.g, f: i })}
              sx={{
                position: "relative", width: 56, aspectRatio: "1", borderRadius: "8px", overflow: "hidden", cursor: "pointer", bgcolor: GROUND,
                border: i === position.f ? "2px solid #000" : `1px solid ${BORDER}`,
              }}
            >
              <ShotImage frame={f} iconSize={14} />
            </Box>
          </Tooltip>
        ))}
      </Box>
      <Typography sx={{ fontSize: 11, color: "text.disabled", textAlign: "center", mt: 1.5 }}>
        ← → shots · ↑ ↓ garments · Esc to close
      </Typography>
    </Dialog>
  );
}
