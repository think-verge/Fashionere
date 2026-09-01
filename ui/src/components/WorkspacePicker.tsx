import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogTitle, DialogContent, List, ListItemButton,
  ListItemText, ListItemIcon, Divider, Box, TextField, Button,
  Typography, CircularProgress,
} from "@mui/material";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import AddIcon from "@mui/icons-material/Add";
import { api } from "../lib/api/client";

interface Workspace {
  _id: string;
  name: string;
  status: string;
  elements: unknown[];
}

interface Props {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onSelect: (wsId: string, wsName: string) => void;
}

export function WorkspacePicker({ open, projectId, onClose, onSelect }: Props) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [creatingPending, setCreatingPending] = useState(false);

  const { data: workspaces = [], isLoading } = useQuery<Workspace[]>({
    queryKey: ["workspaces", projectId],
    queryFn: async () => {
      const { data } = await api.get("/workspace", { params: { project_id: projectId } });
      return Array.isArray(data) ? data : (data.workspaces ?? []);
    },
    enabled: open && !!projectId,
  });

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreatingPending(true);
    try {
      const { data } = await api.post("/workspace", {
        name: newName.trim(),
        project_id: projectId,
      });
      const id = data._id ?? data.id;
      onSelect(id, newName.trim());
      setNewName("");
      setCreating(false);
    } finally {
      setCreatingPending(false);
    }
  }

  function handleClose() {
    setCreating(false);
    setNewName("");
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      PaperProps={{
        sx: {
          borderRadius: "16px",
          border: "1px solid #f0e4e2",
          minWidth: 360,
          maxWidth: 420,
          boxShadow: "0 8px 40px rgba(36,25,24,0.14)",
        },
      }}
    >
      <DialogTitle sx={{ fontSize: 16, fontWeight: 700, pb: 0.5, borderBottom: "1px solid #f0e4e2" }}>
        Add to workspace
      </DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        {isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <List disablePadding>
            {workspaces.length === 0 && !creating && (
              <Box sx={{ px: 3, py: 3, textAlign: "center" }}>
                <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
                  No workspaces yet — create one below.
                </Typography>
              </Box>
            )}
            {workspaces.map((ws) => (
              <ListItemButton
                key={ws._id}
                onClick={() => { onSelect(ws._id, ws.name); handleClose(); }}
                sx={{
                  px: 2.5,
                  py: 1.5,
                  "&:hover": { bgcolor: "#fff0ef" },
                }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <LayersOutlinedIcon sx={{ fontSize: 18, color: "primary.main" }} />
                </ListItemIcon>
                <ListItemText
                  primary={ws.name}
                  secondary={`${ws.elements?.length ?? 0} elements`}
                  primaryTypographyProps={{ fontSize: 14, fontWeight: 500 }}
                  secondaryTypographyProps={{ fontSize: 12 }}
                />
              </ListItemButton>
            ))}

            <Divider sx={{ borderColor: "#f0e4e2" }} />

            {creating ? (
              <Box sx={{ px: 2.5, py: 2 }}>
                <TextField
                  autoFocus
                  size="small"
                  fullWidth
                  placeholder="Workspace name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  sx={{ mb: 1.5, "& .MuiOutlinedInput-root fieldset": { borderColor: "#f0e4e2" } }}
                />
                <Box sx={{ display: "flex", gap: 1 }}>
                  <Button
                    variant="contained"
                    size="small"
                    disabled={!newName.trim() || creatingPending}
                    onClick={handleCreate}
                    sx={{ borderRadius: "8px", flex: 1 }}
                  >
                    {creatingPending ? <CircularProgress size={14} color="inherit" /> : "Create & Add"}
                  </Button>
                  <Button
                    size="small"
                    onClick={() => { setCreating(false); setNewName(""); }}
                    sx={{ borderRadius: "8px", color: "text.secondary" }}
                  >
                    Cancel
                  </Button>
                </Box>
              </Box>
            ) : (
              <ListItemButton
                onClick={() => setCreating(true)}
                sx={{ px: 2.5, py: 1.5, color: "primary.main", "&:hover": { bgcolor: "#fff0ef" } }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <AddIcon sx={{ fontSize: 18, color: "primary.main" }} />
                </ListItemIcon>
                <ListItemText
                  primary="New workspace"
                  primaryTypographyProps={{ fontSize: 14, fontWeight: 500, color: "primary.main" }}
                />
              </ListItemButton>
            )}
          </List>
        )}
      </DialogContent>
    </Dialog>
  );
}
