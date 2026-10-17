import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Box, Typography, Button, Chip, Checkbox, IconButton, Tooltip, Skeleton,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Snackbar, Alert, InputAdornment,
} from "@mui/material";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CreateNewFolderOutlinedIcon from "@mui/icons-material/CreateNewFolderOutlined";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import SearchIcon from "@mui/icons-material/Search";
import { api } from "../../lib/api/client";
import {
  TYPE_ICONS, browserTimeZone, getColors, getElementLabel, getPreviewUrl, isInBuilder,
  type FolderNode, type WorkspaceElement, type WorkspaceLook,
} from "../../lib/elements";

interface FoldersResponse {
  folders: FolderNode[];
  looks: WorkspaceLook[];
}

interface Props {
  workspaceId: string;
  elements: WorkspaceElement[];
  onUpload: (folderId?: string) => void;
}

const border = "1px solid #f0e4e2";

export function MoodboardView({ workspaceId, elements, onUpload }: Props) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ msg: string; severity: "success" | "error" } | null>(null);
  const [nameDialog, setNameDialog] = useState<{ mode: "create" | "rename"; folder?: FolderNode } | null>(null);
  const [nameValue, setNameValue] = useState("");
  const [deleting, setDeleting] = useState<FolderNode | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "silhouette" | "color" | "fabric" | "pattern">("all");

  const { data, isLoading } = useQuery<FoldersResponse>({
    queryKey: ["folders", workspaceId],
    queryFn: async () => (await api.get(`/workspace/${workspaceId}/folders`, { params: { tz: browserTimeZone() } })).data,
    enabled: !!workspaceId,
  });
  const folders = useMemo(() => data?.folders ?? [], [data]);
  const looks = useMemo(() => data?.looks ?? [], [data]);

  const byParent = useMemo(() => {
    const m = new Map<string | null, FolderNode[]>();
    for (const f of folders) m.set(f.parent_id, [...(m.get(f.parent_id) ?? []), f]);
    return m;
  }, [folders]);
  const root = folders.find((f) => f.kind === "looks_root") ?? null;
  // Until the user picks a folder (or if theirs was deleted), show the newest day folder.
  const fallbackId = (root ? byParent.get(root.id)?.[0]?.id : undefined) ?? root?.id ?? null;
  const effectiveId = selectedId && folders.some((f) => f.id === selectedId) ? selectedId : fallbackId;
  const selected = folders.find((f) => f.id === effectiveId) ?? null;

  function selectFolder(id: string | null) {
    setSelectedId(id);
    setPicked(new Set());
  }

  function subtreeIds(folderId: string): Set<string> {
    const out = new Set([folderId]);
    const queue = [folderId];
    while (queue.length) {
      for (const c of byParent.get(queue.shift()!) ?? []) { out.add(c.id); queue.push(c.id); }
    }
    return out;
  }
  function elementsIn(folderId: string) {
    const ids = subtreeIds(folderId);
    return elements.filter((e) => e.folder_id && ids.has(e.folder_id));
  }

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["workspace", workspaceId] });
    qc.invalidateQueries({ queryKey: ["folders", workspaceId] });
  };

  const builderMove = useMutation({
    mutationFn: async (v: { action: "move" | "remove"; body: Record<string, unknown> }) =>
      (await api.post(`/workspace/${workspaceId}/builder/${v.action}`, v.body)).data as { changed: number },
    onSuccess: (res, v) => {
      refresh();
      setPicked(new Set());
      setToast({
        severity: "success",
        msg: res.changed === 0
          ? (v.action === "move" ? "Everything there is already in the AI builder" : "Nothing to remove")
          : `${res.changed} element${res.changed !== 1 ? "s" : ""} ${v.action === "move" ? "moved to the AI builder" : "removed from the AI builder"}`,
      });
    },
    onError: () => setToast({ severity: "error", msg: "Couldn't update the AI builder — try again" }),
  });

  const saveFolder = useMutation({
    mutationFn: async () => {
      if (nameDialog?.mode === "rename" && nameDialog.folder) {
        await api.patch(`/workspace/${workspaceId}/folders/${nameDialog.folder.id}`, { name: nameValue });
        return null;
      }
      return (await api.post(`/workspace/${workspaceId}/folders`, { name: nameValue })).data as { _id: string };
    },
    onSuccess: (created) => {
      refresh();
      if (created) selectFolder(created._id);
      setNameDialog(null);
    },
    onError: () => setToast({ severity: "error", msg: "Couldn't save the folder" }),
  });

  const removeFolder = useMutation({
    mutationFn: async (f: FolderNode) => { await api.delete(`/workspace/${workspaceId}/folders/${f.id}`); },
    onSuccess: (_r, f) => {
      refresh();
      if (effectiveId === f.id) selectFolder(null);
      setDeleting(null);
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setDeleting(null);
      setToast({ severity: "error", msg: status === 409 ? "Take its elements off the builder canvas first" : "Couldn't delete the folder" });
    },
  });

  function openNameDialog(mode: "create" | "rename", folder?: FolderNode) {
    setNameValue(mode === "rename" ? (folder?.name ?? "") : "");
    setNameDialog({ mode, folder });
  }

  const folderOfElement = (e: WorkspaceElement) => {
    const child = folders.find((f) => f.id === e.folder_id);
    const day = child?.parent_id ? folders.find((f) => f.id === child.parent_id) : null;
    return day?.name ?? "";
  };
  const filtering = query.trim() !== "" || typeFilter !== "all";
  const results = useMemo(() => {
    if (!filtering) return [];
    const q = query.trim().toLowerCase();
    return elements.filter((e) => {
      if (e.element_type === "shot") return false;
      if (typeFilter !== "all" && e.element_type !== typeFilter) return false;
      if (!q) return true;
      return [getElementLabel(e), e.garment_type, e.source_brand].some((t) => (t ?? "").toLowerCase().includes(q))
        || getColors(e).some((c) => (c.hex ?? "").toLowerCase().includes(q));
    });
  }, [elements, query, typeFilter, filtering]);

  /** "3 colours, 1 fabric" — what moving these elements brings into the builder. */
  function summarize(els: WorkspaceElement[]) {
    const n = (t: string) => els.filter((e) => e.element_type === t).length;
    return [
      [n("silhouette"), "silhouette"], [n("color"), "colour"], [n("fabric"), "fabric"], [n("pattern"), "pattern"],
    ].filter(([c]) => (c as number) > 0).map(([c, l]) => `${c} ${l}${(c as number) !== 1 ? "s" : ""}`).join(", ") || "nothing to move";
  }

  // ── Tree ────────────────────────────────────────────────────────────────────
  function renderNode(f: FolderNode, depth: number) {
    const kids = byParent.get(f.id) ?? [];
    const open = !collapsed.has(f.id);
    const active = f.id === effectiveId;
    return (
      <Box key={f.id}>
        <Box
          onClick={() => selectFolder(f.id)}
          sx={{
            display: "flex", alignItems: "center", gap: 0.5, pl: 0.5 + depth * 1.5, pr: 1, py: 0.6,
            borderRadius: "8px", cursor: "pointer", bgcolor: active ? "#fff0ef" : "transparent",
            "&:hover": { bgcolor: active ? "#fff0ef" : "#f5f0ef" },
          }}
        >
          <IconButton
            size="small"
            disabled={kids.length === 0}
            aria-label={open ? "Collapse folder" : "Expand folder"}
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed((prev) => { const n = new Set(prev); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n; });
            }}
            sx={{ p: 0.25, visibility: kids.length ? "visible" : "hidden" }}
          >
            {open ? <ExpandMoreIcon sx={{ fontSize: 16 }} /> : <ChevronRightIcon sx={{ fontSize: 16 }} />}
          </IconButton>
          {active ? <FolderOpenOutlinedIcon sx={{ fontSize: 17, color: "primary.main" }} /> : <FolderOutlinedIcon sx={{ fontSize: 17, color: "text.secondary" }} />}
          <Typography sx={{ fontSize: 13, fontWeight: active ? 700 : 500, flex: 1, minWidth: 0 }} noWrap title={f.name}>
            {f.name}
          </Typography>
          {f.kind !== "looks_root" && (
            <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
              {f.kind === "date" || f.kind === "custom" ? elementsIn(f.id).filter((e) => e.element_type !== "shot").length : f.count}
            </Typography>
          )}
        </Box>
        {open && kids.map((k) => renderNode(k, depth + 1))}
      </Box>
    );
  }

  function SearchResults() {
    const allPicked = results.length > 0 && results.every((e) => picked.has(e.element_id));
    return (
      <>
        <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1.5 }}>
          {results.length} match{results.length !== 1 ? "es" : ""} across all folders
        </Typography>
        {results.length > 0 && (
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1.5, flexWrap: "wrap" }}>
            <Button size="small" onClick={() => setPicked(allPicked ? new Set() : new Set(results.map((e) => e.element_id)))} sx={{ fontSize: 12, textTransform: "none" }}>
              {allPicked ? "Clear selection" : "Select all"}
            </Button>
            {picked.size > 0 && (
              <>
                <Button size="small" variant="contained" disableElevation disabled={builderMove.isPending} onClick={() => builderMove.mutate({ action: "move", body: { element_ids: [...picked] } })} sx={{ borderRadius: "8px", fontSize: 12 }}>
                  Move {picked.size} to AI builder
                </Button>
                <Button size="small" variant="outlined" disabled={builderMove.isPending} onClick={() => builderMove.mutate({ action: "remove", body: { element_ids: [...picked] } })} sx={{ borderRadius: "8px", fontSize: 12 }}>
                  Remove from builder
                </Button>
              </>
            )}
          </Box>
        )}
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 1.5 }}>
          {results.map((el) => (
            <ElementCard key={el.element_id} el={el} where={folderOfElement(el)} picked={picked.has(el.element_id)}
              onPick={() => setPicked((prev) => { const n = new Set(prev); if (n.has(el.element_id)) n.delete(el.element_id); else n.add(el.element_id); return n; })} />
          ))}
        </Box>
      </>
    );
  }

  // ── Content ─────────────────────────────────────────────────────────────────
  function Content() {
    if (!selected) {
      return (
        <Box sx={{ textAlign: "center", py: 10 }}>
          <Typography sx={{ fontWeight: 600, color: "text.secondary", mb: 1 }}>Your moodboard is empty</Typography>
          <Typography sx={{ fontSize: 14, color: "text.disabled", mb: 3 }}>
            Add looks from the Looks page — they're filed here by day, ready to move into the AI builder.
          </Typography>
          <Button component={Link} to="/app/looks" variant="contained" sx={{ borderRadius: "10px" }}>Browse looks</Button>
        </Box>
      );
    }

    const isGroup = selected.kind === "date" || selected.kind === "custom";
    const isChild = !isGroup && selected.kind !== "looks_root";
    const subtree = elementsIn(selected.id);
    const movable = subtree.filter((e) => e.element_type !== "shot");
    const inBuilderCount = movable.filter(isInBuilder).length;
    const pending = builderMove.isPending;

    const header = (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 2 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontSize: 18, fontWeight: 700 }} noWrap>{selected.name}</Typography>
          {selected.kind !== "looks_root" && (
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
              {movable.length} element{movable.length !== 1 ? "s" : ""}
              {movable.length > 0 && ` · ${inBuilderCount} in AI builder`}
            </Typography>
          )}
        </Box>
        {selected.kind === "custom" && !selected.system && (
          <>
            <Tooltip title="Rename"><IconButton size="small" aria-label="Rename folder" onClick={() => openNameDialog("rename", selected)}><EditOutlinedIcon sx={{ fontSize: 17 }} /></IconButton></Tooltip>
            <Tooltip title="Delete folder"><IconButton size="small" aria-label="Delete folder" onClick={() => setDeleting(selected)}><DeleteOutlineIcon sx={{ fontSize: 17 }} /></IconButton></Tooltip>
          </>
        )}
        {selected.kind !== "looks_root" && (
          <Button
            size="small" startIcon={<CloudUploadOutlinedIcon />} onClick={() => onUpload(selected.id)}
            sx={{ borderRadius: "8px", border, color: "text.secondary", fontSize: 12 }}
          >
            Upload here
          </Button>
        )}
        {isGroup && (
          <Button
            size="small" variant="contained" disableElevation startIcon={<AutoAwesomeOutlinedIcon />}
            disabled={pending || movable.length === 0 || inBuilderCount === movable.length}
            onClick={() => builderMove.mutate({ action: "move", body: { folder_id: selected.id } })}
            sx={{ borderRadius: "8px", fontSize: 12 }}
          >
            Move all to AI builder
          </Button>
        )}
      </Box>
    );

    if (selected.kind === "looks_root") {
      const days = byParent.get(selected.id) ?? [];
      return (
        <>
          {header}
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 2 }}>
            {days.map((d) => (
              <Box key={d.id} onClick={() => selectFolder(d.id)} sx={{ border, borderRadius: "12px", p: 2, cursor: "pointer", bgcolor: "#fff", "&:hover": { borderColor: "primary.main" } }}>
                <FolderOutlinedIcon sx={{ color: "primary.main", mb: 0.5 }} />
                <Typography sx={{ fontSize: 14, fontWeight: 600 }} noWrap>{d.name}</Typography>
                <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                  {looks.filter((l) => l.date_folder_id === d.id).length} looks
                </Typography>
              </Box>
            ))}
          </Box>
        </>
      );
    }

    if (isGroup) {
      const dayLooks = looks.filter((l) => l.date_folder_id === selected.id);
      const children = byParent.get(selected.id) ?? [];
      return (
        <>
          {header}
          {dayLooks.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "text.secondary", mb: 1 }}>
                Looks added
              </Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 1.5 }}>
                {dayLooks.map((l) => {
                  const own = elements.filter((e) => e.look_id === l.look_id && e.element_type !== "shot");
                  const inB = own.filter(isInBuilder).length;
                  return (
                    <Box key={l.look_id} sx={{ border, borderRadius: "12px", overflow: "hidden", bgcolor: "#fff" }}>
                      <Box component={Link} to={`/app/looks/${encodeURIComponent(l.look_id)}`} sx={{ display: "block", aspectRatio: "3/4", bgcolor: "#f5f0ef" }}>
                        {l.thumbnail && <Box component="img" src={l.thumbnail} alt={l.title || "Look"} sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
                      </Box>
                      <Box sx={{ p: 1 }}>
                        <Typography sx={{ fontSize: 12, fontWeight: 600 }} noWrap title={l.title}>{l.title || l.brand || "Look"}</Typography>
                        <Typography sx={{ fontSize: 11, color: "text.secondary", mb: 0.75 }}>{inB}/{own.length} in builder</Typography>
                        <Tooltip title={`Brings in ${summarize(own.filter((e) => !isInBuilder(e)))}`}>
                          <span>
                            <Button
                              fullWidth size="small" variant="outlined" disabled={pending || own.length === 0 || inB === own.length}
                              onClick={() => builderMove.mutate({ action: "move", body: { look_id: l.look_id, folder_id: selected.id } })}
                              sx={{ borderRadius: "8px", fontSize: 11, py: 0.25, textTransform: "none" }}
                            >
                              Move look to builder
                            </Button>
                          </span>
                        </Tooltip>
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          )}
          <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "text.secondary", mb: 1 }}>
            Folders
          </Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 1.5 }}>
            {children.map((c) => {
              const own = c.kind === "shots" ? [] : elementsIn(c.id);
              const inB = own.filter(isInBuilder).length;
              return (
                <Box key={c.id} sx={{ border, borderRadius: "12px", p: 1.5, bgcolor: "#fff" }}>
                  <Box onClick={() => selectFolder(c.id)} sx={{ cursor: "pointer" }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{c.name}</Typography>
                    <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 1 }}>
                      {c.count} item{c.count !== 1 ? "s" : ""}{c.kind !== "shots" && c.count > 0 ? ` · ${inB} in builder` : ""}
                    </Typography>
                  </Box>
                  {c.kind !== "shots" && (
                    <Button
                      size="small" variant="outlined" fullWidth disabled={pending || own.length === 0 || inB === own.length}
                      onClick={() => builderMove.mutate({ action: "move", body: { folder_id: c.id } })}
                      sx={{ borderRadius: "8px", fontSize: 11, py: 0.25, textTransform: "none" }}
                    >
                      Move to builder
                    </Button>
                  )}
                </Box>
              );
            })}
          </Box>
        </>
      );
    }

    // Element folder
    const items = subtree;
    const allPicked = items.length > 0 && items.every((e) => picked.has(e.element_id));
    return (
      <>
        {header}
        {isChild && selected.kind !== "shots" && items.length > 0 && (
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1.5, flexWrap: "wrap" }}>
            <Button size="small" onClick={() => setPicked(allPicked ? new Set() : new Set(items.map((e) => e.element_id)))} sx={{ fontSize: 12, textTransform: "none" }}>
              {allPicked ? "Clear selection" : "Select all"}
            </Button>
            {picked.size > 0 && (
              <>
                <Button size="small" variant="contained" disableElevation disabled={pending} onClick={() => builderMove.mutate({ action: "move", body: { element_ids: [...picked] } })} sx={{ borderRadius: "8px", fontSize: 12 }}>
                  Move {picked.size} to AI builder
                </Button>
                <Button size="small" variant="outlined" disabled={pending} onClick={() => builderMove.mutate({ action: "remove", body: { element_ids: [...picked] } })} sx={{ borderRadius: "8px", fontSize: 12 }}>
                  Remove from builder
                </Button>
              </>
            )}
          </Box>
        )}
        {items.length === 0 ? (
          <Box sx={{ border: "1px dashed #f0e4e2", borderRadius: "12px", p: 5, textAlign: "center", color: "text.disabled", fontSize: 14 }}>
            Nothing in {selected.name} yet.
          </Box>
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 1.5 }}>
            {items.map((el) => <ElementCard key={el.element_id} el={el} picked={picked.has(el.element_id)} onPick={() => setPicked((prev) => { const n = new Set(prev); if (n.has(el.element_id)) n.delete(el.element_id); else n.add(el.element_id); return n; })} />)}
          </Box>
        )}
      </>
    );
  }

  if (isLoading) return <Skeleton variant="rectangular" height={360} sx={{ borderRadius: "12px" }} />;

  return (
    <Box sx={{ display: "flex", gap: 3, alignItems: "flex-start", flexWrap: { xs: "wrap", md: "nowrap" } }}>
      <Box sx={{ width: { xs: "100%", md: 260 }, flexShrink: 0, border, borderRadius: "12px", bgcolor: "#faf8f7", p: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 1, py: 0.5 }}>
          <Typography sx={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.15em", textTransform: "uppercase", color: "text.secondary" }}>
            Moodboard
          </Typography>
          <Tooltip title="New folder">
            <IconButton size="small" aria-label="New folder" onClick={() => openNameDialog("create")} sx={{ color: "primary.main" }}>
              <CreateNewFolderOutlinedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>
        {root ? renderNode(root, 0) : (
          <Typography sx={{ fontSize: 12, color: "text.disabled", px: 1, py: 2 }}>No folders yet</Typography>
        )}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mb: 2 }}>
          <TextField
            size="small" placeholder="Search all folders — fabric, colour, brand…" value={query}
            onChange={(e) => { setQuery(e.target.value); setPicked(new Set()); }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18 }} /></InputAdornment> } }}
            sx={{ minWidth: 260, "& .MuiOutlinedInput-root fieldset": { borderColor: "#f0e4e2" } }}
          />
          {(["all", "silhouette", "color", "fabric", "pattern"] as const).map((t) => (
            <Chip
              key={t} label={t === "all" ? "All" : `${t === "color" ? "colour" : t}s`} size="small" clickable
              color={typeFilter === t ? "primary" : "default"} variant={typeFilter === t ? "filled" : "outlined"}
              onClick={() => { setTypeFilter(t); setPicked(new Set()); }}
              sx={{ textTransform: "capitalize" }}
            />
          ))}
          {filtering && (
            <Button size="small" onClick={() => { setQuery(""); setTypeFilter("all"); setPicked(new Set()); }} sx={{ textTransform: "none", fontSize: 12 }}>Clear</Button>
          )}
        </Box>
        {filtering ? SearchResults() : Content()}
      </Box>

      <Dialog open={!!nameDialog} onClose={() => setNameDialog(null)} slotProps={{ paper: { sx: { borderRadius: "16px", minWidth: 340 } } }}>
        <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>{nameDialog?.mode === "rename" ? "Rename folder" : "New folder"}</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth size="small" placeholder="Folder name" value={nameValue} onChange={(e) => setNameValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && nameValue.trim() && saveFolder.mutate()} sx={{ mt: 0.5 }} />
          {nameDialog?.mode === "create" && (
            <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 1 }}>
              shots, silhouettes, color palettes, fabrics and patterns folders are created inside automatically.
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setNameDialog(null)} sx={{ color: "text.secondary", textTransform: "none" }}>Cancel</Button>
          <Button variant="contained" disableElevation disabled={!nameValue.trim() || saveFolder.isPending} onClick={() => saveFolder.mutate()} sx={{ borderRadius: "8px", textTransform: "none" }}>
            {nameDialog?.mode === "rename" ? "Save" : "Create"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleting} onClose={() => setDeleting(null)} slotProps={{ paper: { sx: { borderRadius: "16px", maxWidth: 400 } } }}>
        <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>Delete "{deleting?.name}"?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            Everything filed inside it is removed from this workspace. This can't be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleting(null)} sx={{ color: "text.secondary", textTransform: "none" }}>Cancel</Button>
          <Button color="error" variant="contained" disableElevation disabled={removeFolder.isPending} onClick={() => deleting && removeFolder.mutate(deleting)} sx={{ borderRadius: "8px", textTransform: "none" }}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        {toast ? <Alert severity={toast.severity} onClose={() => setToast(null)} sx={{ borderRadius: "10px" }}>{toast.msg}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}

function ElementCard({ el, picked, onPick, where }: { el: WorkspaceElement; picked: boolean; onPick: () => void; where?: string }) {
  const url = getPreviewUrl(el);
  const colors = getColors(el);
  const inBuilder = isInBuilder(el);
  const isShot = el.element_type === "shot";
  return (
    <Box sx={{ border: picked ? "1.5px solid #000" : border, borderRadius: "12px", overflow: "hidden", bgcolor: "#fff", position: "relative" }}>
      <Box sx={{ aspectRatio: "1", bgcolor: "#f5f0ef", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {url ? (
          <Box component="img" src={url} alt={getElementLabel(el)} sx={{ width: "100%", height: "100%", objectFit: isShot ? "cover" : "contain", display: "block" }} />
        ) : colors.length > 0 ? (
          <Box sx={{ display: "flex", width: "100%", height: "100%" }}>
            {colors.map((c, i) => <Box key={i} sx={{ flex: 1, bgcolor: c.hex }} />)}
          </Box>
        ) : (
          <Typography sx={{ fontSize: 28 }}>{TYPE_ICONS[el.element_type]}</Typography>
        )}
      </Box>
      {!isShot && (
        <Checkbox
          size="small" checked={picked} onChange={onPick} inputProps={{ "aria-label": `Select ${getElementLabel(el)}` }}
          sx={{ position: "absolute", top: 4, left: 4, p: 0.5, bgcolor: "rgba(255,255,255,0.9)", borderRadius: "6px", "&:hover": { bgcolor: "#fff" }, "&.Mui-checked": { color: "text.primary" } }}
        />
      )}
      {!isShot && (
        <Chip
          label={inBuilder ? "In builder" : "Moodboard"} size="small" color={inBuilder ? "success" : "default"} variant={inBuilder ? "filled" : "outlined"}
          sx={{ position: "absolute", top: 8, right: 8, height: 20, fontSize: 10, bgcolor: inBuilder ? undefined : "rgba(255,255,255,0.9)" }}
        />
      )}
      <Box sx={{ p: 1 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600 }} noWrap title={getElementLabel(el)}>{getElementLabel(el)}</Typography>
        <Typography sx={{ fontSize: 11, color: "text.secondary", textTransform: "capitalize" }} noWrap>
          {el.is_custom ? "Custom" : `${el.source_brand || "—"} · ${el.garment_type}`}
        </Typography>
        {where && <Typography sx={{ fontSize: 10, color: "text.disabled" }} noWrap title={where}>{where}</Typography>}
        {el.look_id && (
          <Typography component={Link} to={`/app/looks/${encodeURIComponent(el.look_id)}`} sx={{ fontSize: 10, color: "primary.main", textDecoration: "none", "&:hover": { textDecoration: "underline" } }}>
            Open source look
          </Typography>
        )}
      </Box>
    </Box>
  );
}
