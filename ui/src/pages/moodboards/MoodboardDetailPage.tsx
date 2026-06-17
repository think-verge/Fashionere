import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  Alert,
  Skeleton,
  Chip,
  LinearProgress,
  IconButton,
  TextField,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EditIcon from "@mui/icons-material/Edit";
import CheckIcon from "@mui/icons-material/Check";
import { PageShell } from "../../components/PageShell";
import { MoodboardViewer } from "../../components/MoodboardViewer";
import { getCentoireAPI } from "../../lib/api/generated/client";
import type { Moodboard } from "../../lib/api/generated/model";

const api = getCentoireAPI();

export function MoodboardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [moodboard, setMoodboard] = useState<Moodboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [polling, setPolling] = useState(false);

  async function load() {
    if (!id) return;
    try {
      const doc = await api.getApiV1MoodboardsId(id);
      setMoodboard(doc);
      setNameValue(doc.name);
      if (doc.status === "pending" || doc.status === "running") {
        setPolling(true);
        startPolling(id);
      }
    } catch {
      setError("Failed to load moodboard");
    } finally {
      setLoading(false);
    }
  }

  function startPolling(boardId: string) {
    const interval = setInterval(async () => {
      try {
        const doc = await api.getApiV1MoodboardsId(boardId);
        setMoodboard(doc);
        if (doc.status === "done" || doc.status === "error") {
          clearInterval(interval);
          setPolling(false);
        }
      } catch {
        clearInterval(interval);
        setPolling(false);
      }
    }, 2500);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [id]);

  async function saveName() {
    if (!id) return;
    await api.patchApiV1MoodboardsId(id, { name: nameValue });
    setEditingName(false);
    setMoodboard((prev) => prev ? { ...prev, name: nameValue } : prev);
  }

  if (loading) return (
    <PageShell title="Moodboard">
      <Skeleton variant="rectangular" height={400} sx={{ borderRadius: 2 }} />
    </PageShell>
  );

  if (error) return (
    <PageShell title="Moodboard">
      <Alert severity="error">{error}</Alert>
    </PageShell>
  );

  if (!moodboard) return null;

  return (
    <PageShell title="Moodboard">
      <Box sx={{ maxWidth: 1000, mx: "auto" }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate("/moodboards")}
          sx={{ mb: 2 }}
          size="small"
        >
          All Boards
        </Button>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
          {editingName ? (
            <>
              <TextField
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                size="small"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && saveName()}
              />
              <IconButton size="small" onClick={saveName} color="primary">
                <CheckIcon fontSize="small" />
              </IconButton>
            </>
          ) : (
            <>
              <Typography variant="h5" fontWeight={700}>
                {moodboard.name || "Untitled"}
              </Typography>
              <IconButton size="small" onClick={() => setEditingName(true)}>
                <EditIcon fontSize="small" />
              </IconButton>
            </>
          )}
          <Chip
            label={moodboard.status}
            size="small"
            color={moodboard.status === "done" ? "success" : moodboard.status === "error" ? "error" : "default"}
          />
        </Box>

        {polling && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Still generating — checking for updates…
            </Typography>
            <LinearProgress />
          </Box>
        )}

        {moodboard.status === "error" && (
          <Alert severity="error" sx={{ mb: 3 }}>Generation failed: {moodboard.error}</Alert>
        )}

        {moodboard.status === "done" && moodboard.moodboard && (
          <MoodboardViewer data={moodboard.moodboard as Parameters<typeof MoodboardViewer>[0]["data"]} />
        )}
      </Box>
    </PageShell>
  );
}
