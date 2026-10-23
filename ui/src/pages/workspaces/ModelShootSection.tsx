import { useState } from "react";
import {
  Autocomplete, Box, Button, Chip, CircularProgress, Dialog, IconButton, Menu, MenuItem, Select, Skeleton, Snackbar, TextField, Tooltip, Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { api } from "../../lib/api/client";
import { ConceptImage } from "../../components/ConceptImage";
import { CompareVariations } from "./CompareVariations";
import { EditorialCard, type Editorial } from "./EditorialMagazine";
import { variationName, variationsQueryKey } from "./stage3Shared";

// Stage 3: one finalised garment at a time, on a model. Configure the model → one main image → edit or regenerate
// it → approve → the art director invents new editorial shots from it (a fresh set every time) → the garment's own
// editorial. A switcher picks the garment in focus; "Compare variations" shows its Stage 2 variations side by side.

type ImageStatus = "pending" | "generating" | "generated" | "failed";

interface ModelConfig { gender: string; size: string; height: string; skin_tone: string; age: string; hair: string }
interface Outfit { top: string; bottoms: string; shoes: string; accessories: string }

interface ShootImage {
  id: string;
  kind: "main" | "shot";
  version: number | null;
  is_current: boolean;
  batch: number | null;
  instruction: string | null;
  title: string | null;
  view: string | null;
  status: ImageStatus;
  image_url: string | null;
  error: string | null;
}

interface Shoot {
  id: string;
  status: "generating" | "ready" | "failed";
  model_config: ModelConfig;
  outfit: Outfit | null;
  approved_main_id: string | null;
  editorial: Editorial | null;
  main: { current: ShootImage | null; versions: ShootImage[] };
  shots: ShootImage[];
  total_cost_usd: number;
}

interface Garment {
  concept_id: string;
  garment_type: string;
  accumulated_edits: string[];
  shoot: Shoot | null;
}

interface ShootList {
  default_model_config: ModelConfig;
  cost_per_image_usd: number;
  garments: Garment[];
}

const BORDER = "#f0e4e2";
const GROUND = "#f5f0ef";

// Suggestions only — every field also accepts free text.
const CONFIG_FIELDS: Array<{ key: keyof ModelConfig; label: string; options: string[] }> = [
  { key: "gender", label: "Gender", options: ["female", "male"] },
  { key: "size", label: "Size", options: ["XS", "S", "M (UK 12 / US 8)", "L", "XL", "XXL", "plus-size"] },
  { key: "height", label: "Height", options: ["petite", "average height", "tall"] },
  { key: "skin_tone", label: "Skin tone", options: ["fair", "light", "medium", "olive", "tan", "medium-deep warm brown", "deep brown", "dark"] },
  { key: "age", label: "Age", options: ["early 20s", "mid-20s", "30s", "40s", "50s", "60s+"] },
  { key: "hair", label: "Hair", options: ["dark hair pulled back into a low sleek bun", "long loose waves", "short cropped natural hair", "blonde bob", "shoulder-length straight hair"] },
];
const OUTFIT_FIELDS: Array<{ key: keyof Outfit; label: string }> = [
  { key: "top", label: "Top" },
  { key: "bottoms", label: "Bottoms" },
  { key: "shoes", label: "Shoes" },
  { key: "accessories", label: "Accessories" },
];

const busy = (s: { status: ImageStatus }) => s.status === "pending" || s.status === "generating";
const titleCase = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : "Garment");
const VIEW_LABEL: Record<string, string> = { front: "Front", three_quarter: "Three-quarter", side: "Side", back: "Back", close_detail: "Detail" };

function errorMessage(err: unknown) {
  const e = err as { response?: { data?: { detail?: string; error?: string } } };
  return e.response?.data?.detail ?? e.response?.data?.error ?? "Something went wrong. Try again.";
}

// ─── Section ──────────────────────────────────────────────────────────────────

const focusKey = (workspaceId?: string) => `fashionere.stage3.focus.${workspaceId}`;

function readFocus(workspaceId?: string) {
  try { return localStorage.getItem(focusKey(workspaceId)); } catch { return null; }
}

export function ModelShootSection({ workspaceId, workspaceName }: { workspaceId?: string; workspaceName: string }) {
  const qc = useQueryClient();
  const queryKey = ["model-shoots", workspaceId];
  const [selected, setSelected] = useState<string | null>(() => readFocus(workspaceId));
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null);
  const [comparing, setComparing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, isLoading } = useQuery<ShootList>({
    queryKey,
    queryFn: async () => (await api.get("/model-shoots", { params: { workspace_id: workspaceId } })).data,
    enabled: !!workspaceId,
    refetchInterval: (q) => (q.state.data?.garments.some((g) => g.shoot?.status === "generating") ? 4000 : false),
  });
  const garments = data?.garments ?? [];
  const garment = garments.find((g) => g.concept_id === selected) ?? garments[0] ?? null;

  // How many Stage 2 variations the focused garment has, for the compare button.
  const { data: variations } = useQuery<{ variations: unknown[] }>({
    queryKey: variationsQueryKey(garment?.concept_id),
    queryFn: async () => (await api.get("/model-shoots/variations", { params: { concept_id: garment!.concept_id } })).data,
    enabled: !!garment,
  });
  const variationCount = variations?.variations.length ?? 0;

  const focus = (conceptId: string) => {
    setSelected(conceptId);
    setMenuEl(null);
    try { localStorage.setItem(focusKey(workspaceId), conceptId); } catch { /* the focus just won't be remembered */ }
  };
  const onDone = () => qc.invalidateQueries({ queryKey });
  const onError = (err: unknown) => setNotice(errorMessage(err));

  if (isLoading) return <Skeleton variant="rounded" sx={{ height: 420, borderRadius: "16px" }} />;
  if (!garments.length || !garment) {
    return (
      <Box sx={{ height: 200, border: "1.5px dashed #e8dedd", borderRadius: "16px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, bgcolor: "#faf8f7", px: 4 }}>
        <Typography sx={{ fontSize: 13, color: "text.disabled", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>No garments yet</Typography>
        <Typography sx={{ fontSize: 12, color: "text.disabled", textAlign: "center" }}>Move refined designs to garment concepts in Stage 2 to shoot them on a model.</Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Focus: Stage 3 works on one garment at a time */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", p: 1.25, border: "1px solid #ecdedb", borderRadius: "14px", bgcolor: "#fff", mb: 4 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "#8a817e", pl: 0.5 }}>Working on</Typography>
        <Box
          component="button"
          type="button"
          aria-haspopup="menu"
          onClick={(e: React.MouseEvent<HTMLElement>) => setMenuEl(e.currentTarget)}
          sx={{ display: "flex", alignItems: "center", gap: 1.25, border: "1.5px solid #000", borderRadius: "10px", p: "5px 10px 5px 5px", bgcolor: "#fff", cursor: "pointer", textAlign: "left", maxWidth: "100%", font: "inherit", color: "inherit", "&:focus-visible": { outline: "2px solid #000", outlineOffset: 2 } }}
        >
          <Box sx={{ width: 38, height: 38, flexShrink: 0, borderRadius: "6px", overflow: "hidden" }}>
            <ConceptImage conceptId={garment.concept_id} sx={{ objectFit: "contain" }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>{titleCase(garment.garment_type)}</Typography>
            <Typography sx={{ fontSize: 11.5, color: "text.secondary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>{variationName(garment)}</Typography>
          </Box>
          <Typography component="span" sx={{ fontSize: 12, color: "text.secondary", ml: 0.5 }}>▾</Typography>
        </Box>
        <Menu anchorEl={menuEl} open={!!menuEl} onClose={() => setMenuEl(null)} slotProps={{ paper: { sx: { borderRadius: "12px", minWidth: 280 } } }}>
          {garments.map((g) => (
            <MenuItem key={g.concept_id} selected={g.concept_id === garment.concept_id} onClick={() => focus(g.concept_id)} sx={{ gap: 1.25 }}>
              <Box sx={{ width: 34, height: 34, flexShrink: 0, borderRadius: "5px", overflow: "hidden", border: `1px solid ${BORDER}` }}>
                <ConceptImage conceptId={g.concept_id} sx={{ objectFit: "contain" }} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{titleCase(g.garment_type)}</Typography>
                <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
                  {variationName(g)} · {g.shoot ? (g.shoot.status === "generating" ? "generating" : `${g.shoot.shots.length} shots`) : "not shot yet"}
                </Typography>
              </Box>
            </MenuItem>
          ))}
        </Menu>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="outlined"
          disabled={variationCount < 2}
          onClick={() => setComparing(true)}
          sx={{ borderRadius: "8px", textTransform: "none", color: "text.primary", borderColor: "#e6d9d6" }}
        >
          {variationCount < 2 ? "No other variations" : `Compare variations (${variationCount})`}
        </Button>
      </Box>

      <GarmentShoot
        key={garment.concept_id}
        garment={garment}
        defaults={data!.default_model_config}
        costPerImage={data!.cost_per_image_usd}
        onDone={onDone}
        onError={onError}
      />

      <EditorialCard
        key={`editorial-${garment.concept_id}`}
        garment={garment}
        others={garments.filter((g) => g.concept_id !== garment.concept_id)}
        workspaceName={workspaceName}
        onChanged={onDone}
        onFocus={focus}
      />

      {comparing && (
        <CompareVariations
          open
          onClose={() => setComparing(false)}
          focusId={garment.concept_id}
          focusShootId={garment.shoot?.id ?? null}
          modelConfig={(garment.shoot?.model_config as unknown as Record<string, string>) ?? null}
          outfit={(garment.shoot?.outfit as unknown as Record<string, string>) ?? null}
          costPerImage={data!.cost_per_image_usd}
          onFocus={focus}
        />
      )}

      <Snackbar open={!!notice} autoHideDuration={4000} onClose={() => setNotice(null)} message={notice} anchorOrigin={{ vertical: "bottom", horizontal: "center" }} />
    </Box>
  );
}

// ─── One garment's shoot ──────────────────────────────────────────────────────

function GarmentShoot({ garment, defaults, costPerImage, onDone, onError }: {
  garment: Garment;
  defaults: ModelConfig;
  costPerImage: number;
  onDone: () => void;
  onError: (err: unknown) => void;
}) {
  const shoot = garment.shoot;
  const [config, setConfig] = useState<ModelConfig>(shoot?.model_config ?? defaults);
  const [outfit, setOutfit] = useState<Outfit | null>(shoot?.outfit ?? null);
  const [instruction, setInstruction] = useState("");
  const [shotCount, setShotCount] = useState(3);
  const [lightbox, setLightbox] = useState<ShootImage | null>(null);

  // Pick up the server's values when they change (the stylist's outfit arriving, a version being selected).
  const serverKey = JSON.stringify([shoot?.model_config ?? null, shoot?.outfit ?? null]);
  const [syncedKey, setSyncedKey] = useState(serverKey);
  if (syncedKey !== serverKey) {
    setSyncedKey(serverKey);
    if (shoot?.model_config) setConfig(shoot.model_config);
    setOutfit(shoot?.outfit ?? null);
  }

  const handlers = { onSuccess: onDone, onError };
  const start = useMutation({ mutationFn: () => api.post(`/concepts/${garment.concept_id}/model-shoot`, { model_config: config }), ...handlers });
  const regenerate = useMutation({ mutationFn: () => api.post(`/model-shoots/${shoot!.id}/main`, { model_config: config, outfit: outfit ?? undefined }), ...handlers });
  const edit = useMutation({
    mutationFn: () => api.post(`/model-shoots/${shoot!.id}/main`, { instruction }),
    onSuccess: () => { setInstruction(""); onDone(); },
    onError,
  });
  const select = useMutation({ mutationFn: (imageId: string) => api.post(`/model-shoots/${shoot!.id}/main/${imageId}/select`), ...handlers });
  const shots = useMutation({ mutationFn: () => api.post(`/model-shoots/${shoot!.id}/shots`, { count: shotCount }), ...handlers });
  const remove = useMutation({ mutationFn: (imageId: string) => api.delete(`/model-shoots/${shoot!.id}/shots/${imageId}`), ...handlers });

  const main = shoot?.main.current ?? null;
  const generating = shoot?.status === "generating";
  const pending = start.isPending || regenerate.isPending || edit.isPending || shots.isPending;
  const locked = generating || pending;
  const mainReady = main?.status === "generated";
  const approved = !!shoot?.approved_main_id && shoot.approved_main_id === main?.id;
  const cost = (n: number) => `$${(n * costPerImage).toFixed(2)}`;

  return (
    <Box>
      {/* 01 Main image */}
      <SectionTitle n="01" title="Main image" note={shoot ? `${shoot.main.versions.length} version${shoot.main.versions.length === 1 ? "" : "s"}` : "model · studio"} />
      <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 4, mb: 6 }}>
        <Box sx={{ flex: "0 0 auto", width: { xs: "100%", md: "44%" } }}>
          <Box sx={{ position: "relative", aspectRatio: "3/4", borderRadius: "16px", overflow: "hidden", bgcolor: GROUND }}>
            {main ? (
              <ImageFrame img={main} onOpen={() => mainReady && setLightbox(main)} label={main.instruction ? `Edit: ${main.instruction}` : null} />
            ) : (
              <Box sx={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, px: 4 }}>
                <Box sx={{ width: "45%", aspectRatio: "1", opacity: 0.9 }}>
                  <ConceptImage conceptId={garment.concept_id} sx={{ objectFit: "contain", borderRadius: "8px" }} />
                </Box>
                <Typography sx={{ fontSize: 12, color: "text.secondary", textAlign: "center", mt: 1 }}>
                  Set up the model, then generate the main image of {garment.garment_type || "the garment"} on them.
                </Typography>
              </Box>
            )}
            {approved && <Chip label="Approved" size="small" sx={{ position: "absolute", top: 12, left: 12, bgcolor: "#e8f5e9", color: "#1b5e20", fontSize: 11, height: 22 }} />}
          </Box>
          {shoot && shoot.main.versions.length > 1 && (
            <Select
              size="small"
              value={main?.id ?? ""}
              disabled={locked}
              onChange={(e) => select.mutate(e.target.value)}
              sx={{ mt: 1.5, fontSize: 12, minWidth: 200, borderRadius: "8px" }}
            >
              {shoot.main.versions.map((v) => (
                <MenuItem key={v.id} value={v.id} disabled={v.status !== "generated"} sx={{ fontSize: 12 }}>
                  Version {v.version}{v.instruction ? ` · ${v.instruction.slice(0, 40)}` : ""}{v.status === "failed" ? " · failed" : ""}
                </MenuItem>
              ))}
            </Select>
          )}
        </Box>

        <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          <Panel title="Model" note={shoot ? "changing gender, age or skin tone casts a new model; other changes keep her" : undefined}>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
              {CONFIG_FIELDS.map((f) => (
                <Autocomplete
                  key={f.key}
                  freeSolo
                  disableClearable
                  size="small"
                  options={f.options}
                  value={config[f.key]}
                  onInputChange={(_, v) => setConfig((c) => ({ ...c, [f.key]: v }))}
                  disabled={locked}
                  sx={f.key === "hair" ? { gridColumn: { sm: "1 / -1" } } : undefined}
                  renderInput={(params) => <TextField {...params} label={f.label} />}
                />
              ))}
            </Box>
          </Panel>

          {shoot && (
            <Panel title="Outfit" note={outfit ? "suggested by the stylist · edit freely" : "the stylist picks it with the first image"}>
              {outfit ? (
                <Box sx={{ display: "grid", gap: 1.5 }}>
                  {OUTFIT_FIELDS.map((f) => (
                    <TextField
                      key={f.key}
                      size="small"
                      label={f.label}
                      value={outfit[f.key] === "none" ? "" : outfit[f.key]}
                      placeholder="none"
                      disabled={locked}
                      onChange={(e) => setOutfit((o) => ({ ...(o as Outfit), [f.key]: e.target.value }))}
                    />
                  ))}
                </Box>
              ) : (
                <Skeleton variant="rounded" height={120} />
              )}
            </Panel>
          )}

          <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
            {!shoot ? (
              <Button variant="contained" disableElevation disabled={locked} onClick={() => start.mutate()} sx={actionSx}>
                {pending ? <CircularProgress size={16} sx={{ color: "#fff" }} /> : `Generate main image · ${cost(1)}`}
              </Button>
            ) : (
              <Button variant="outlined" disabled={locked} onClick={() => regenerate.mutate()} sx={outlineSx}>
                Regenerate with these settings · {cost(1)}
              </Button>
            )}
            {generating && <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Generating… about 1–2 minutes per image.</Typography>}
          </Box>

          {shoot && mainReady && (
            <Panel title="Edit this image" note="describe a change — everything else stays the same">
              <Box sx={{ display: "flex", gap: 1.5 }}>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="e.g. swap the jeans for wide-leg charcoal trousers"
                  value={instruction}
                  disabled={locked}
                  onChange={(e) => setInstruction(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && instruction.trim() && !locked) edit.mutate(); }}
                />
                <Button variant="outlined" disabled={locked || !instruction.trim()} onClick={() => edit.mutate()} sx={{ ...outlineSx, flexShrink: 0 }}>
                  Apply · {cost(1)}
                </Button>
              </Box>
            </Panel>
          )}

          {shoot && mainReady && (
            <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap", pt: 1, borderTop: `1px solid ${BORDER}` }}>
              <Typography sx={{ fontSize: 13, color: "text.secondary", flex: 1, minWidth: 200 }}>
                Happy with the main image? Approve it and the art director creates a new set of editorial shots from it.
              </Typography>
              <Select size="small" value={shotCount} disabled={locked} onChange={(e) => setShotCount(Number(e.target.value))} sx={{ fontSize: 12, borderRadius: "8px" }}>
                {[2, 3, 4, 5, 6].map((n) => <MenuItem key={n} value={n} sx={{ fontSize: 12 }}>{n} shots</MenuItem>)}
              </Select>
              <Button variant="contained" disableElevation disabled={locked} onClick={() => shots.mutate()} sx={actionSx}>
                {approved && shoot.shots.length ? "Generate more shots" : "Approve & generate shots"} · {cost(shotCount)}
              </Button>
            </Box>
          )}
        </Box>
      </Box>

      {/* 02 Editorial shots */}
      {shoot && shoot.shots.length > 0 && (
        <>
          <SectionTitle n="02" title="Editorial shots" note="on-model · new ideas every batch" />
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 3, mb: 4 }}>
            {shoot.shots.map((s) => (
              <Box key={s.id} sx={{ "&:hover .ms-del": { opacity: 1 } }}>
                <Box sx={{ position: "relative", aspectRatio: "3/4", borderRadius: "16px", overflow: "hidden", bgcolor: GROUND }}>
                  <ImageFrame img={s} onOpen={() => s.status === "generated" && setLightbox(s)} label={null} />
                  {!busy(s) && (
                    <Tooltip title="Remove shot">
                      <IconButton
                        className="ms-del"
                        size="small"
                        aria-label="Remove shot"
                        onClick={() => remove.mutate(s.id)}
                        sx={{ position: "absolute", top: 10, right: 10, opacity: 0, transition: "opacity 0.15s", bgcolor: "rgba(255,255,255,0.9)", "&:hover": { bgcolor: "#fff" } }}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
                <Typography sx={{ fontSize: 13, fontWeight: 600, mt: 1.25 }}>{s.title ?? (busy(s) ? "Art directing…" : "Untitled")}</Typography>
                <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{[s.view && VIEW_LABEL[s.view], s.batch && `Set ${s.batch}`].filter(Boolean).join(" · ")}</Typography>
              </Box>
            ))}
          </Box>
        </>
      )}

      {shoot && (
        <Typography sx={{ fontSize: 11, color: "text.disabled" }}>Spent on this shoot: ${shoot.total_cost_usd.toFixed(2)}</Typography>
      )}

      <Dialog open={!!lightbox} onClose={() => setLightbox(null)} maxWidth="md" slotProps={{ paper: { sx: { borderRadius: "16px", p: 1.5, bgcolor: "#fff" } } }}>
        {lightbox?.image_url && (
          <Box sx={{ position: "relative" }}>
            <Box component="img" src={lightbox.image_url} alt={lightbox.title ?? "Main image"} sx={{ display: "block", maxWidth: "100%", maxHeight: "82vh", borderRadius: "10px" }} />
            <IconButton aria-label="Close" onClick={() => setLightbox(null)} size="small" sx={{ position: "absolute", top: 8, right: 8, bgcolor: "rgba(255,255,255,0.9)" }}>
              <CloseIcon fontSize="small" />
            </IconButton>
            {lightbox.title && <Typography sx={{ fontSize: 13, fontWeight: 600, mt: 1 }}>{lightbox.title}</Typography>}
          </Box>
        )}
      </Dialog>
    </Box>
  );
}

// ─── Bits ─────────────────────────────────────────────────────────────────────

const actionSx = { borderRadius: "8px", textTransform: "none", bgcolor: "#000", color: "#fff", px: 2.5, "&:hover": { bgcolor: "#222" } } as const;
const outlineSx = { borderRadius: "8px", textTransform: "none", color: "text.primary", borderColor: BORDER } as const;

function SectionTitle({ n, title, note }: { n: string; title: string; note: string }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 3 }}>
      <Typography sx={{ fontSize: 18, color: "text.primary", fontFamily: "'Literata', Georgia, serif" }}>
        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "Inter, sans-serif", letterSpacing: "0.05em", marginRight: "12px", color: "#999" }}>{n}</span>
        {title}
      </Typography>
      <Typography sx={{ fontSize: 12, color: "text.secondary", letterSpacing: "0.05em", textTransform: "uppercase" }}>{note}</Typography>
    </Box>
  );
}

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mb: 1.25 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>{title}</Typography>
        {note && <Typography sx={{ fontSize: 11, color: "text.disabled" }}>{note}</Typography>}
      </Box>
      {children}
    </Box>
  );
}

function ImageFrame({ img, onOpen, label }: { img: ShootImage; onOpen: () => void; label: string | null }) {
  if (img.status === "generated" && img.image_url) {
    return (
      <>
        <Box component="img" src={img.image_url} alt={img.title ?? "Model shot"} onClick={onOpen} sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", cursor: "zoom-in" }} />
        {label && (
          <Chip label={label} size="small" sx={{ position: "absolute", bottom: 12, left: 12, maxWidth: "calc(100% - 24px)", bgcolor: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 11, height: 22 }} />
        )}
      </>
    );
  }
  if (img.status === "failed") {
    return (
      <Box sx={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, bgcolor: "#fdf3f2", px: 3 }}>
        <ErrorOutlineIcon sx={{ fontSize: 32, color: "#c62828" }} />
        <Typography sx={{ fontSize: 12, color: "#c62828", textAlign: "center" }}>This image couldn't be generated.</Typography>
      </Box>
    );
  }
  return (
    <>
      <Skeleton variant="rectangular" animation="wave" sx={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      <Typography sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "text.secondary" }}>
        Generating…
      </Typography>
    </>
  );
}
