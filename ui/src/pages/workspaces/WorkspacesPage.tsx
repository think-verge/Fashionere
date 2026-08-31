import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Box, Grid, Card, CardActionArea, CardContent,
  Typography, Chip, Button, TextField, Alert,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import { PageHeader } from "../../components/PageHeader";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api/client";

interface Workspace {
  _id: string;
  name: string;
  status: "draft" | "ready" | "generating";
  elements: unknown[];
  created_at: string;
}

interface WorkspacesResponse {
  workspaces: Workspace[];
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

  const { data, isLoading, error } = useQuery<WorkspacesResponse>({
    queryKey: ["workspaces", activeProject?.id],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (activeProject?.id) params.projectId = activeProject.id;
      const { data } = await api.get("/workspace", { params });
      return data;
    },
  });

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
    onSuccess: () => {
      setNewName("");
      setCreating(false);
      qc.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });

  const workspaces = data?.workspaces ?? [];

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
            mb: 4,
            p: 3,
            border: "1px solid #f0e4e2",
            borderRadius: "12px",
            bgcolor: "#faf8f7",
            display: "flex",
            gap: 2,
            alignItems: "flex-end",
          }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 500, mb: 1, color: "text.secondary" }}>Workspace name</Typography>
            <TextField
              fullWidth
              size="small"
              placeholder="Spring Collection Research"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createWs.mutate()}
              autoFocus
              sx={{ "& .MuiOutlinedInput-root": { bgcolor: "#fff", "& fieldset": { borderColor: "#f0e4e2" } } }}
            />
          </Box>
          <Button
            variant="contained"
            disabled={createWs.isPending}
            onClick={() => createWs.mutate()}
            sx={{ borderRadius: "10px", py: 1, whiteSpace: "nowrap" }}
          >
            {createWs.isPending ? "Creating…" : "Create"}
          </Button>
          <Button
            variant="text"
            onClick={() => { setCreating(false); setNewName(""); }}
            sx={{ color: "text.secondary", borderRadius: "10px", py: 1 }}
          >
            Cancel
          </Button>
        </Box>
      )}

      {isLoading ? (
        <Grid container spacing={2.5}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={i}>
              <Card sx={{ height: 160 }} />
            </Grid>
          ))}
        </Grid>
      ) : error ? (
        <Alert severity="error">Failed to load workspaces.</Alert>
      ) : workspaces.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 12, border: "1px dashed #f0e4e2", borderRadius: 2 }}>
          <LayersOutlinedIcon sx={{ fontSize: 40, color: "#dfbfbc", mb: 2 }} />
          <Typography sx={{ color: "text.secondary", mb: 1, fontWeight: 500 }}>No workspaces yet</Typography>
          <Typography sx={{ color: "text.disabled", fontSize: 14 }}>
            Create a workspace to start collecting elements from looks.
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={2.5}>
          {workspaces.map((ws) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={ws._id}>
              <Card sx={{ height: "100%", "&:hover": { borderColor: "#dfbfbc" }, transition: "border-color 0.15s" }}>
                <CardActionArea
                  onClick={() => navigate(`/app/workspace/${ws._id}`)}
                  sx={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "flex-start", p: 0 }}
                >
                  <CardContent sx={{ width: "100%", pb: "20px !important" }}>
                    <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 2 }}>
                      <Box
                        sx={{
                          width: 40,
                          height: 40,
                          borderRadius: "10px",
                          bgcolor: "#fff0ef",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <LayersOutlinedIcon sx={{ fontSize: 20, color: "primary.main" }} />
                      </Box>
                      <Chip
                        label={ws.status}
                        color={STATUS_COLOR[ws.status] ?? "default"}
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: 10, textTransform: "capitalize" }}
                      />
                    </Box>
                    <Typography sx={{ fontWeight: 700, fontSize: 16, color: "text.primary", mb: 0.75 }}>
                      {ws.name}
                    </Typography>
                    <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                      {ws.elements?.length ?? 0} element{ws.elements?.length !== 1 ? "s" : ""}
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
