import { useEffect, useState } from "react";
import {
  Box,
  Grid,
  Paper,
  Typography,
  Button,
  Alert,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  IconButton,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import FolderIcon from "@mui/icons-material/Folder";
import DeleteIcon from "@mui/icons-material/Delete";
import { PageShell } from "../../components/PageShell";
import { PageHeader } from "../../components/PageHeader";
import { getCentoireAPI } from "../../lib/api/generated/client";
import type { Project } from "../../lib/api/generated/model";

const api = getCentoireAPI();

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      const data = await api.getApiV1Projects();
      setProjects(data);
    } catch {
      setError("Failed to load projects");
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  async function create() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const doc = await api.postApiV1Projects({ name: newName, description: newDesc });
      setProjects((p) => [doc, ...p]);
      setDialogOpen(false);
      setNewName("");
      setNewDesc("");
    } catch {
      setError("Failed to create project");
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: string) {
    await api.deleteApiV1ProjectsId(id);
    setProjects((p) => p.filter((proj) => proj._id !== id));
  }

  return (
    <PageShell title="Projects">
      <PageHeader
        eyebrow="Studio Workspace"
        heading="Design Projects"
        description="Organise your mood boards, trend analyses, and concepts into collections."
      />
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 3 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
          New Project
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={2}>
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
                <Skeleton variant="rectangular" height={160} sx={{ borderRadius: 2 }} />
              </Grid>
            ))
          : projects.length === 0
          ? (
              <Grid size={12}>
                <Paper sx={{ p: 5, textAlign: "center" }}>
                  <FolderIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
                  <Typography color="text.secondary">
                    No projects yet. Create one to organise your work.
                  </Typography>
                </Paper>
              </Grid>
            )
          : projects.map((proj) => (
              <Grid key={proj._id} size={{ xs: 12, sm: 6, md: 4 }}>
                <Paper sx={{ p: 2.5 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <Typography variant="subtitle2" fontWeight={600}>
                      {proj.name}
                    </Typography>
                    <IconButton size="small" onClick={() => remove(proj._id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                  {proj.description && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                      {proj.description}
                    </Typography>
                  )}
                  <Box sx={{ mt: 1.5, display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                    {proj.tags.map((tag) => (
                      <Chip key={tag} label={tag} size="small" sx={{ fontSize: 10 }} />
                    ))}
                  </Box>
                </Paper>
              </Grid>
            ))}
      </Grid>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>New Project</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            <TextField
              label="Project Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              fullWidth
              autoFocus
            />
            <TextField
              label="Description (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              fullWidth
              multiline
              minRows={2}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={create} disabled={!newName.trim() || creating}>
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </PageShell>
  );
}
