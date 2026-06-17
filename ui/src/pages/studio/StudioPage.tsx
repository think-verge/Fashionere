import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Box,
  Paper,
  Typography,
  Tabs,
  Tab,
  TextField,
  Button,
  Alert,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  LinearProgress,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { PageShell } from "../../components/PageShell";
import { MoodboardViewer } from "../../components/MoodboardViewer";
import { getCentoireAPI } from "../../lib/api/generated/client";
import type { Moodboard } from "../../lib/api/generated/model";

const api = getCentoireAPI();

export function StudioPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preloadCatalogueId = searchParams.get("catalogueItemId");

  const [tab, setTab] = useState(preloadCatalogueId ? 1 : 0);
  const [query, setQuery] = useState("");
  const [catalogueItemId, setCatalogueItemId] = useState(preloadCatalogueId ?? "");
  const [imageUrl, setImageUrl] = useState("");
  const [catalogueItems, setCatalogueItems] = useState<{ catalogue_item_id: string; name: string }[]>([]);
  const [moodboard, setMoodboard] = useState<Moodboard | null>(null);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getApiV1Catalogue().then((items) => {
      setCatalogueItems(items as { catalogue_item_id: string; name: string }[]);
    });
  }, []);

  async function handleCreate() {
    setError("");
    setMoodboard(null);
    setPolling(true);
    try {
      let doc: Moodboard;
      if (tab === 0) {
        doc = await api.postApiV1MoodboardsFromQuery({ query });
      } else if (tab === 1) {
        doc = await api.postApiV1MoodboardsFromCatalogue({ catalogue_item_id: catalogueItemId });
      } else {
        doc = await api.postApiV1MoodboardsFromImage({ image_url: imageUrl });
      }
      setMoodboard(doc);
      pollStatus(doc._id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create moodboard");
      setPolling(false);
    }
  }

  function pollStatus(id: string) {
    const interval = setInterval(async () => {
      try {
        const doc = await api.getApiV1MoodboardsId(id);
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

  const canSubmit =
    (tab === 0 && query.trim().length > 2) ||
    (tab === 1 && catalogueItemId.length > 0) ||
    (tab === 2 && imageUrl.trim().length > 0);

  return (
    <PageShell title="Studio">
      <Box sx={{ maxWidth: 900, mx: "auto" }}>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>
          Moodboard Studio
        </Typography>
        <Typography color="text.secondary" variant="body2" sx={{ mb: 3 }}>
          Generate AI-powered fashion moodboards from text, catalogue items, or images
        </Typography>

        <Paper sx={{ mb: 3 }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: "1px solid", borderColor: "divider", px: 2 }}>
            <Tab label="Text Query" />
            <Tab label="Catalogue Item" />
            <Tab label="Image URL" />
          </Tabs>
          <Box sx={{ p: 3 }}>
            {tab === 0 && (
              <TextField
                label="Describe your collection"
                placeholder="e.g. minimalist beachwear for summer 2025, earthy tones"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                fullWidth
                multiline
                minRows={3}
              />
            )}
            {tab === 1 && (
              <FormControl fullWidth>
                <InputLabel>Select Catalogue Item</InputLabel>
                <Select
                  value={catalogueItemId}
                  label="Select Catalogue Item"
                  onChange={(e) => setCatalogueItemId(e.target.value)}
                >
                  {catalogueItems.map((item) => (
                    <MenuItem key={item.catalogue_item_id} value={item.catalogue_item_id}>
                      {item.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            {tab === 2 && (
              <TextField
                label="Image URL"
                placeholder="https://..."
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                fullWidth
                helperText="Provide a URL to an image of a garment or design reference"
              />
            )}
            <Box sx={{ mt: 2, display: "flex", gap: 2, alignItems: "center" }}>
              <Button
                variant="contained"
                size="large"
                startIcon={<AutoAwesomeIcon />}
                onClick={handleCreate}
                disabled={!canSubmit || polling}
              >
                {polling ? "Generating…" : "Generate Moodboard"}
              </Button>
              {moodboard?.status === "done" && (
                <Button variant="outlined" onClick={() => navigate(`/moodboards/${moodboard._id}`)}>
                  View Full Board
                </Button>
              )}
            </Box>
          </Box>
        </Paper>

        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

        {polling && moodboard?.status !== "done" && (
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Generating your moodboard — this takes about 30–60 seconds…
            </Typography>
            <LinearProgress color="primary" />
          </Paper>
        )}

        {moodboard?.status === "done" && moodboard.moodboard && (
          <Box>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
              Your Moodboard
            </Typography>
            <MoodboardViewer data={moodboard.moodboard as Parameters<typeof MoodboardViewer>[0]["data"]} />
          </Box>
        )}

        {moodboard?.status === "error" && (
          <Alert severity="error">Moodboard generation failed: {moodboard.error}</Alert>
        )}
      </Box>
    </PageShell>
  );
}
