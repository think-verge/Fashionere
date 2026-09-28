import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Box,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Typography, Chip, Button, TextField, Alert,
  IconButton, Menu, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions,
  Tooltip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { PageHeader } from "../../components/PageHeader";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api/client";

interface Workspace {
  _id: string;
  name: string;
  status: "draft" | "ready" | "generating";
  elements: unknown[];
  createdAt: string;
}

const STATUS_COLOR: Record<string, "default" | "success" | "warning" | "info"> = {
  draft: "default",
  ready: "success",
  generating: "warning",
};

export default function WorkspacesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { activeProject } = useAuth();

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // Per-card menu state
  const [menuAnchor, setMenuAnchor] = useState<{ el: HTMLElement; wsId: string; wsName: string } | null>(null);

  // Rename dialog state
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameName, setRenameName] = useState("");

  // Delete confirm state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get("q")?.toLowerCase() || "";

  const { data: workspaces = [], isLoading, error } = useQuery<Workspace[]>({
    queryKey: ["workspaces", activeProject?.id],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (activeProject?.id) params.project_id = activeProject.id;
      const { data } = await api.get("/workspace", { params });
      return Array.isArray(data) ? data : (data.workspaces ?? []);
    },
    refetchInterval: (query) => (query.state.data?.some(ws => ws.status === "generating") ? 3000 : false),
  });

  const filteredWorkspaces = workspaces.filter(ws => 
    ws.name.toLowerCase().includes(searchQuery)
  );

  const createWs = useMutation({
    mutationFn: async () => {
      const projectId = activeProject?.id;
      if (!projectId) throw new Error("No active project");
      const { data } = await api.post("/workspace", {
        name: newName.trim() || "New Workspace",
        project_id: projectId,
      });
      return data;
    },
    onSuccess: (data) => {
      setNewName("");
      setCreating(false);
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      navigate(`/app/workspace/${data._id}`);
    },
  });

  const renameWs = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      await api.patch(`/workspace/${id}`, { name });
    },
    onSuccess: () => {
      setRenameTarget(null);
      qc.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });

  const deleteWs = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/workspace/${id}`);
    },
    onSuccess: () => {
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });

  function openMenu(e: React.MouseEvent<HTMLElement>, ws: Workspace) {
    e.stopPropagation();
    e.preventDefault();
    setMenuAnchor({ el: e.currentTarget, wsId: ws._id, wsName: ws.name });
  }

  function startRename() {
    if (!menuAnchor) return;
    setRenameTarget({ id: menuAnchor.wsId, name: menuAnchor.wsName });
    setRenameName(menuAnchor.wsName);
    setMenuAnchor(null);
  }

  function startDelete() {
    if (!menuAnchor) return;
    setDeleteTarget({ id: menuAnchor.wsId, name: menuAnchor.wsName });
    setMenuAnchor(null);
  }

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 6 }}>
        <PageHeader
          eyebrow="Your Projects"
          heading="Workspaces"
          description="Collect garment elements from looks and build AI-powered collections."
        />
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreating(true)}
          sx={{ mt: 1, borderRadius: "10px", flexShrink: 0 }}
        >
          New Workspace
        </Button>
      </Box>

      {creating && (
        <Box
          sx={{
            mb: 4, p: 3, border: "1px solid #f0e4e2", borderRadius: "12px",
            bgcolor: "#faf8f7", display: "flex", gap: 2, alignItems: "flex-end",
          }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 500, mb: 1, color: "text.secondary" }}>Workspace name</Typography>
            <TextField
              fullWidth size="small" placeholder="Spring Collection Research"
              value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createWs.mutate()}
              autoFocus
              sx={{ "& .MuiOutlinedInput-root": { bgcolor: "#fff", "& fieldset": { borderColor: "#f0e4e2" } } }}
            />
          </Box>
          <Button variant="contained" disabled={createWs.isPending} onClick={() => createWs.mutate()}
            sx={{ borderRadius: "10px", py: 1, whiteSpace: "nowrap" }}>
            {createWs.isPending ? "Creating…" : "Create"}
          </Button>
          <Button variant="text" onClick={() => { setCreating(false); setNewName(""); }}
            sx={{ color: "text.secondary", borderRadius: "10px", py: 1 }}>
            Cancel
          </Button>
        </Box>
      )}

      {isLoading ? (
        <Paper variant="outlined" sx={{ borderRadius: "12px", border: "1px solid #f0e4e2", overflow: "hidden" }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Box key={i} sx={{ px: 3, py: 2, borderBottom: i < 3 ? "1px solid #f0e4e2" : "none", display: "flex", gap: 2, alignItems: "center" }}>
              <Box sx={{ width: 32, height: 32, borderRadius: "8px", bgcolor: "#f0e4e2" }} />
              <Box sx={{ flex: 1 }}>
                <Box sx={{ height: 14, width: "30%", borderRadius: 1, bgcolor: "#f0e4e2", mb: 1 }} />
                <Box sx={{ height: 11, width: "15%", borderRadius: 1, bgcolor: "#f5f0ef" }} />
              </Box>
            </Box>
          ))}
        </Paper>
      ) : error ? (
        <Alert severity="error">Failed to load workspaces.</Alert>
      ) : filteredWorkspaces.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 12, border: "1px dashed #f0e4e2", borderRadius: 2 }}>
          <LayersOutlinedIcon sx={{ fontSize: 40, color: "#dfbfbc", mb: 2 }} />
          <Typography sx={{ color: "text.secondary", mb: 1, fontWeight: 500 }}>No workspaces yet</Typography>
          <Typography sx={{ color: "text.disabled", fontSize: 14 }}>
            Create a workspace to start collecting elements from looks.
          </Typography>
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: "12px", border: "1px solid #f0e4e2" }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: "#faf8f7" }}>
                <TableCell sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.secondary", py: 1.5, borderColor: "#f0e4e2" }}>
                  Name
                </TableCell>
                <TableCell sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.secondary", py: 1.5, borderColor: "#f0e4e2" }}>
                  Status
                </TableCell>
                <TableCell sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.secondary", py: 1.5, borderColor: "#f0e4e2" }}>
                  Elements
                </TableCell>
                <TableCell sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.secondary", py: 1.5, borderColor: "#f0e4e2" }}>
                  Created
                </TableCell>
                <TableCell sx={{ borderColor: "#f0e4e2", py: 1.5, width: 80 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredWorkspaces.map((ws) => (
                <TableRow
                  key={ws._id}
                  hover
                  onClick={() => navigate(`/app/workspace/${ws._id}`)}
                  sx={{
                    cursor: "pointer",
                    "&:last-child td": { border: 0 },
                    "& td": { borderColor: "#f0e4e2" },
                    "&:hover .ws-open-icon": { opacity: 1 },
                    "&:hover .ws-menu-btn": { opacity: 1 },
                  }}
                >
                  <TableCell sx={{ py: 2 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                      <Box sx={{ width: 32, height: 32, borderRadius: "8px", bgcolor: "#fff0ef", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <LayersOutlinedIcon sx={{ fontSize: 16, color: "primary.main" }} />
                      </Box>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                        <Typography sx={{ fontWeight: 600, fontSize: 14, color: "text.primary" }}>
                          {ws.name}
                        </Typography>
                        <OpenInNewIcon className="ws-open-icon" sx={{ fontSize: 13, color: "primary.main", opacity: 0, transition: "opacity 0.15s" }} />
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ py: 2 }}>
                    <Chip
                      label={ws.status}
                      color={STATUS_COLOR[ws.status] ?? "default"}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: 10, textTransform: "capitalize", height: 22 }}
                    />
                  </TableCell>
                  <TableCell sx={{ py: 2, fontSize: 13, color: "text.secondary" }}>
                    {ws.elements?.length ?? 0}
                  </TableCell>
                  <TableCell sx={{ py: 2, fontSize: 13, color: "text.secondary" }}>
                    {ws.createdAt ? new Date(ws.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—"}
                  </TableCell>
                  <TableCell sx={{ py: 2 }} align="right">
                    <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                      <Tooltip title="Options">
                        <IconButton
                          className="ws-menu-btn"
                          size="small"
                          onClick={(e) => openMenu(e, ws)}
                          sx={{
                            opacity: 0,
                            transition: "opacity 0.15s",
                            "&:hover": { bgcolor: "#fff0ef", color: "primary.main" },
                          }}
                        >
                          <MoreVertIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Per-card options menu */}
      <Menu
        anchorEl={menuAnchor?.el}
        open={!!menuAnchor}
        onClose={() => setMenuAnchor(null)}
        PaperProps={{ sx: { borderRadius: "10px", border: "1px solid #f0e4e2", minWidth: 160, boxShadow: "0 4px 20px rgba(36,25,24,0.10)" } }}
      >
        <MenuItem onClick={startRename} sx={{ fontSize: 14, gap: 1.5 }}>
          <EditOutlinedIcon fontSize="small" sx={{ color: "text.secondary" }} /> Rename
        </MenuItem>
        <MenuItem onClick={startDelete} sx={{ fontSize: 14, color: "error.main", gap: 1.5 }}>
          <DeleteOutlineIcon fontSize="small" /> Delete
        </MenuItem>
      </Menu>

      {/* Rename dialog */}
      <Dialog
        open={!!renameTarget}
        onClose={() => setRenameTarget(null)}
        PaperProps={{ sx: { borderRadius: "14px", border: "1px solid #f0e4e2", minWidth: 360 } }}
      >
        <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>Rename workspace</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus fullWidth size="small" value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && renameName.trim() && renameWs.mutate({ id: renameTarget!.id, name: renameName.trim() })}
            sx={{ mt: 1, "& .MuiOutlinedInput-root fieldset": { borderColor: "#f0e4e2" } }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setRenameTarget(null)} sx={{ color: "text.secondary", borderRadius: "8px" }}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!renameName.trim() || renameWs.isPending}
            onClick={() => renameWs.mutate({ id: renameTarget!.id, name: renameName.trim() })}
            sx={{ borderRadius: "8px" }}
          >
            {renameWs.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        PaperProps={{ sx: { borderRadius: "14px", border: "1px solid #f0e4e2", minWidth: 360 } }}
      >
        <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>Delete workspace?</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: "text.secondary", fontSize: 14 }}>
            "<strong>{deleteTarget?.name}</strong>" and all its elements will be permanently deleted.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setDeleteTarget(null)} sx={{ color: "text.secondary", borderRadius: "8px" }}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            disabled={deleteWs.isPending}
            onClick={() => deleteWs.mutate(deleteTarget!.id)}
            sx={{ borderRadius: "8px" }}
          >
            {deleteWs.isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
