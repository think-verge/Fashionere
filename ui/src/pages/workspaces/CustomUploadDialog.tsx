import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Box, Typography, Button, Alert,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  Tab, Tabs, TextField, LinearProgress, Checkbox, FormControlLabel,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import CreateNewFolderOutlinedIcon from "@mui/icons-material/CreateNewFolderOutlined";
import { api } from "../../lib/api/client";
import { browserTimeZone, type FolderNode } from "../../lib/elements";

const UPLOAD_TABS = ["silhouette", "fabric", "pattern", "color"] as const;
type UploadTab = (typeof UPLOAD_TABS)[number];

/** Which element folder inside a day/custom folder each upload tab files into. */
const TAB_FOLDER: Record<UploadTab, string> = {
  silhouette: "silhouettes",
  fabric: "fabrics",
  pattern: "patterns",
  color: "color palettes",
};

const NEW_FOLDER = "__new__";

const TAB_LABELS: Record<UploadTab, string> = {
  silhouette: "👗 Silhouette",
  fabric: "🪢 Fabric",
  pattern: "✦ Pattern",
  color: "🎨 Colour",
};

export function CustomUploadDialog({
  open,
  onClose,
  workspaceId,
  defaultFolderId,
  defaultToBuilder = false,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  /** Pre-selected destination (a folder id). Defaults to today's folder. */
  defaultFolderId?: string;
  /** Also move the upload to the AI builder (on by default when uploading from the builder). */
  defaultToBuilder?: boolean;
}) {
  const qc = useQueryClient();
  // "" = today's folder (created automatically), NEW_FOLDER = create one
  const [folderChoice, setFolderChoice] = useState<string>("");
  const [newFolderName, setNewFolderName] = useState("");
  const [toBuilder, setToBuilder] = useState(defaultToBuilder);

  const { data: folderData } = useQuery<{ folders: FolderNode[] }>({
    queryKey: ["folders", workspaceId],
    queryFn: async () => (await api.get(`/workspace/${workspaceId}/folders`, { params: { tz: browserTimeZone() } })).data,
    enabled: open && !!workspaceId,
  });
  const destinations = (folderData?.folders ?? []).filter((f) => f.kind === "date" || f.kind === "custom");

  // Re-seed the destination each time the dialog opens (state adjusted during render).
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFolderChoice(defaultFolderId ?? "");
      setNewFolderName("");
      setToBuilder(defaultToBuilder);
    }
  }

  // A child folder (e.g. "fabrics") chosen elsewhere resolves to its parent group.
  const allFolders = folderData?.folders ?? [];
  const chosenGroup = (() => {
    const f = allFolders.find((x) => x.id === folderChoice);
    return f && f.kind !== "date" && f.kind !== "custom" ? (f.parent_id ?? "") : folderChoice;
  })();

  const folderFields = () => ({
    ...(chosenGroup === NEW_FOLDER
      ? { new_folder_name: newFolderName.trim() }
      : chosenGroup ? { folder_id: chosenGroup } : {}),
    tz: browserTimeZone(),
    in_builder: toBuilder,
  });
  const folderInvalid = chosenGroup === NEW_FOLDER && !newFolderName.trim();
  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["workspace", workspaceId] });
    qc.invalidateQueries({ queryKey: ["folders", workspaceId] });
  };
  const [tab, setTab] = useState<UploadTab>("silhouette");
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [colorHex, setColorHex] = useState("#a93533");
  const [colorName, setColorName] = useState("");
  const [colorList, setColorList] = useState<Array<{ hex: string; name: string }>>([]);
  const [savingColor, setSavingColor] = useState(false);

  function reset() {
    setFile(null);
    setLabel("");
    setError(null);
    setColorHex("#a93533");
    setColorName("");
    setColorList([]);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("element_type", tab);
      if (label.trim()) fd.append("label", label.trim());
      for (const [k, v] of Object.entries(folderFields())) if (v !== undefined) fd.append(k, String(v));
      await api.post(`/workspace/${workspaceId}/elements/upload`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      refreshAll();
      handleClose();
    } catch {
      setError("Upload failed. Check file size (max 10 MB) and try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSaveColor() {
    if (colorList.length === 0) return;
    setSavingColor(true);
    setError(null);
    try {
      await api.post(`/workspace/${workspaceId}/elements`, {
        element_type: "color",
        garment_type: "custom",
        look_id: "",
        garment_id: "",
        source_brand: "custom",
        is_custom: true,
        data: { colors: colorList },
        ...folderFields(),
      });
      refreshAll();
      if (chosenGroup === NEW_FOLDER) setFolderChoice("");
      setColorList([]);
      setColorHex("#a93533");
      setColorName("");
    } catch {
      setError("Failed to save colours. Please try again.");
    } finally {
      setSavingColor(false);
    }
  }

  const fileLabel = file ? file.name : null;
  const previewUrl = file ? URL.createObjectURL(file) : null;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: "16px", border: "1px solid #f0e4e2" } }}
    >
      <DialogTitle sx={{ fontSize: 18, fontWeight: 700, pb: 0 }}>
        Upload Custom Elements
        <Typography sx={{ fontSize: 13, color: "text.secondary", fontWeight: 400, mt: 0.5 }}>
          Add your own designs to this workspace.
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        <Tabs
          value={tab}
          onChange={(_e, v) => { setTab(v as UploadTab); setFile(null); setLabel(""); setError(null); }}
          sx={{ mb: 2.5, "& .MuiTab-root": { fontSize: 12, fontWeight: 600, minWidth: 0, px: 1.5 } }}
        >
          {UPLOAD_TABS.map((t) => (
            <Tab key={t} value={t} label={TAB_LABELS[t]} />
          ))}
        </Tabs>

        {error && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: "8px" }}>{error}</Alert>
        )}

        {tab !== "color" ? (
          <Box>
            <Box
              component="label"
              htmlFor="custom-upload-input"
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 1.5,
                border: "2px dashed",
                borderColor: file ? "primary.main" : "#e8dedd",
                borderRadius: "12px",
                p: 3,
                cursor: "pointer",
                bgcolor: file ? "#fff8f8" : "#faf8f7",
                transition: "border-color 0.15s, background 0.15s",
                "&:hover": { borderColor: "primary.main", bgcolor: "#fff8f8" },
                minHeight: 140,
                position: "relative",
                overflow: "hidden",
              }}
            >
              <input
                id="custom-upload-input"
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); }}
              />
              {previewUrl ? (
                <Box
                  component="img"
                  src={previewUrl}
                  alt="Preview"
                  sx={{ maxHeight: 120, maxWidth: "100%", objectFit: "contain", borderRadius: "8px" }}
                />
              ) : (
                <>
                  <CloudUploadOutlinedIcon sx={{ fontSize: 32, color: "text.disabled" }} />
                  <Typography sx={{ fontSize: 13, color: "text.secondary", textAlign: "center" }}>
                    Click to choose an image
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
                    JPG, PNG, WebP · max 10 MB
                  </Typography>
                </>
              )}
            </Box>
            {fileLabel && (
              <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 0.75, ml: 0.5 }}>
                {fileLabel}
              </Typography>
            )}

            <TextField
              fullWidth
              size="small"
              label={tab === "fabric" ? "Fabric name (required)" : "Label (optional)"}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              sx={{ mt: 2, "& .MuiOutlinedInput-root fieldset": { borderColor: "#f0e4e2" } }}
            />

            {uploading && <LinearProgress sx={{ mt: 1.5, borderRadius: 4 }} />}
          </Box>
        ) : (
          <Box>
            <Box sx={{ display: "flex", gap: 2, alignItems: "flex-end", mb: 1.5 }}>
              <Box>
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: "text.secondary", mb: 0.5 }}>Colour</Typography>
                <Box
                  component="input"
                  type="color"
                  value={colorHex}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setColorHex(e.target.value)}
                  sx={{ width: 52, height: 40, border: "1px solid #f0e4e2", borderRadius: "8px", cursor: "pointer", p: 0.5 }}
                />
              </Box>
              <TextField
                size="small"
                label="Hex"
                value={colorHex}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setColorHex(v);
                }}
                sx={{ width: 100, "& .MuiOutlinedInput-root fieldset": { borderColor: "#f0e4e2" } }}
              />
              <TextField
                size="small"
                label="Colour name"
                value={colorName}
                onChange={(e) => setColorName(e.target.value)}
                sx={{ flex: 1, "& .MuiOutlinedInput-root fieldset": { borderColor: "#f0e4e2" } }}
              />
              <Button
                size="small"
                startIcon={<AddCircleOutlineIcon />}
                disabled={!/^#[0-9a-fA-F]{6}$/.test(colorHex)}
                onClick={() => {
                  setColorList((prev) => [...prev, { hex: colorHex, name: colorName || colorHex }]);
                  setColorName("");
                }}
                sx={{ borderRadius: "8px", whiteSpace: "nowrap", flexShrink: 0 }}
              >
                Add
              </Button>
            </Box>

            {colorList.length > 0 && (
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 1.5 }}>
                {colorList.map((c, i) => (
                  <Box
                    key={i}
                    sx={{ display: "flex", alignItems: "center", gap: 0.75, bgcolor: "#faf8f7", border: "1px solid #f0e4e2", borderRadius: "8px", px: 1, py: 0.5 }}
                  >
                    <Box sx={{ width: 14, height: 14, borderRadius: "3px", bgcolor: c.hex, border: "1px solid rgba(0,0,0,0.1)" }} />
                    <Typography sx={{ fontSize: 12 }}>{c.name}</Typography>
                    <IconButton
                      size="small"
                      onClick={() => setColorList((prev) => prev.filter((_, j) => j !== i))}
                      sx={{ width: 16, height: 16, ml: 0.25 }}
                    >
                      <CloseIcon sx={{ fontSize: 10 }} />
                    </IconButton>
                  </Box>
                ))}
              </Box>
            )}
            {colorList.length === 0 && (
              <Typography sx={{ fontSize: 12, color: "text.disabled", mt: 1 }}>
                Pick a colour and click Add. You can build a palette with multiple colours.
              </Typography>
            )}
          </Box>
        )}

        <Box sx={{ mt: 2.5, pt: 2, borderTop: "1px solid #f0e4e2" }}>
          <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "text.secondary", mb: 1 }}>
            Save to folder
          </Typography>
          <Box sx={{ maxHeight: 168, overflowY: "auto", border: "1px solid #f0e4e2", borderRadius: "10px", bgcolor: "#faf8f7" }}>
            {[{ id: "", name: "Today's folder", sub: "Created automatically" } as const, ...destinations.map((d) => ({ id: d.id, name: d.name, sub: "" })), { id: NEW_FOLDER, name: "New folder…", sub: "" } as const].map((opt) => {
              const active = chosenGroup === opt.id;
              return (
                <Box
                  key={opt.id || "today"}
                  role="button"
                  tabIndex={0}
                  aria-pressed={active}
                  onClick={() => setFolderChoice(opt.id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setFolderChoice(opt.id)}
                  sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 0.9, cursor: "pointer", bgcolor: active ? "#fff0ef" : "transparent", "&:hover": { bgcolor: active ? "#fff0ef" : "#f5f0ef" } }}
                >
                  {opt.id === NEW_FOLDER
                    ? <CreateNewFolderOutlinedIcon sx={{ fontSize: 17, color: "primary.main" }} />
                    : <FolderOutlinedIcon sx={{ fontSize: 17, color: active ? "primary.main" : "text.secondary" }} />}
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: active ? 700 : 500 }} noWrap>{opt.name}</Typography>
                    {active && opt.id !== NEW_FOLDER && (
                      <Typography sx={{ fontSize: 11, color: "text.secondary" }}>→ {TAB_FOLDER[tab]}</Typography>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>
          {chosenGroup === NEW_FOLDER && (
            <TextField
              fullWidth size="small" autoFocus label="New folder name" value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              helperText="shots, silhouettes, color palettes, fabrics and patterns folders are created inside"
              sx={{ mt: 1.5, "& .MuiOutlinedInput-root fieldset": { borderColor: "#f0e4e2" } }}
            />
          )}
          <FormControlLabel
            sx={{ mt: 0.5, ml: 0 }}
            control={<Checkbox size="small" checked={toBuilder} onChange={(e) => setToBuilder(e.target.checked)} />}
            label={<Typography sx={{ fontSize: 13 }}>Also add to the AI builder</Typography>}
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button onClick={handleClose} sx={{ color: "text.secondary", borderRadius: "8px" }}>Cancel</Button>
        {tab !== "color" ? (
          <Button
            variant="contained"
            disabled={!file || (tab === "fabric" && !label.trim()) || uploading || folderInvalid}
            onClick={handleUpload}
            sx={{ borderRadius: "8px", minWidth: 100 }}
          >
            {uploading ? "Uploading…" : "Upload"}
          </Button>
        ) : (
          <Button
            variant="contained"
            disabled={colorList.length === 0 || savingColor || folderInvalid}
            onClick={handleSaveColor}
            sx={{ borderRadius: "8px", minWidth: 100 }}
          >
            {savingColor ? "Saving…" : `Save ${colorList.length > 0 ? `(${colorList.length})` : "Palette"}`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
