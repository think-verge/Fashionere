import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Box, Typography, Button, Alert,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  Tab, Tabs, TextField, LinearProgress,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import { api } from "../../lib/api/client";

const UPLOAD_TABS = ["silhouette", "fabric", "pattern", "color"] as const;
type UploadTab = (typeof UPLOAD_TABS)[number];

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
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
}) {
  const qc = useQueryClient();
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
      await api.post(`/workspace/${workspaceId}/elements/upload`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      qc.invalidateQueries({ queryKey: ["workspace", workspaceId] });
      setFile(null);
      setLabel("");
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
      });
      qc.invalidateQueries({ queryKey: ["workspace", workspaceId] });
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
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button onClick={handleClose} sx={{ color: "text.secondary", borderRadius: "8px" }}>Cancel</Button>
        {tab !== "color" ? (
          <Button
            variant="contained"
            disabled={!file || (tab === "fabric" && !label.trim()) || uploading}
            onClick={handleUpload}
            sx={{ borderRadius: "8px", minWidth: 100 }}
          >
            {uploading ? "Uploading…" : "Upload"}
          </Button>
        ) : (
          <Button
            variant="contained"
            disabled={colorList.length === 0 || savingColor}
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
