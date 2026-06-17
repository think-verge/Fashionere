import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Typography, Button, Chip, Grid, LinearProgress,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import AddIcon from "@mui/icons-material/Add";
import { PageShell } from "../../components/PageShell";
import { PageHeader } from "../../components/PageHeader";
import { MoodboardViewer } from "../../components/MoodboardViewer";
import { getCentoireAPI } from "../../lib/api/generated/client";
import type { Moodboard } from "../../lib/api/generated/model";

const api = getCentoireAPI();

const TREND_FILTERS = ["All Trends", "Sustainability", "Tech-Forward", "Bio-Organic", "Extreme Fluidity"];

const CONCEPT_PLACEHOLDERS = [
  { match: 94, label: "Liquid Metal Collection" },
  { match: 89, label: "Structured Sheer" },
  { match: 78, label: "Bio-Sequins" },
];

export function StudioPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("All Trends");
  const [moodboard, setMoodboard] = useState<Moodboard | null>(null);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!query.trim()) return;
    setError("");
    setMoodboard(null);
    setPolling(true);
    try {
      const doc = await api.postApiV1MoodboardsFromQuery({ query });
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

  return (
    <PageShell title="Studio">
      <PageHeader
        eyebrow="Creative Tools"
        heading="Inspiration Engine"
        description="Generate AI-powered design concepts from text, catalogue items, or image references."
      />

      {/* Input area */}
      <Box sx={{ maxWidth: 800, mb: 5 }}>
        <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.18em", color: "text.secondary", mb: 1.5 }}>
          Describe Your Vision
        </Typography>
        <Box
          component="textarea"
          value={query}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setQuery(e.target.value)}
          placeholder="e.g. minimalist beachwear for summer 2025, earthy tones and organic textures..."
          rows={4}
          sx={{
            width: "100%", border: "1px solid", borderColor: "divider", borderRadius: "12px",
            p: 2.5, fontSize: 15, lineHeight: 1.6, resize: "vertical", minHeight: 100,
            fontFamily: "inherit", color: "text.primary", bgcolor: "#fff",
            outline: "none", "&:focus": { borderColor: "primary.main" },
            boxSizing: "border-box", display: "block",
          }}
        />
        {error && (
          <Typography sx={{ color: "error.main", fontSize: 13, mt: 1 }}>{error}</Typography>
        )}
        <Box sx={{ display: "flex", gap: 1.5, mt: 1.5 }}>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={!query.trim() || polling}
            startIcon={<AutoAwesomeIcon sx={{ fontSize: 16 }} />}
            sx={{ flex: 3, py: 1.25, fontSize: 14, fontWeight: 600, borderRadius: "10px" }}
          >
            {polling ? "Generating…" : "Generate Concepts"}
          </Button>
          <Button
            variant="outlined"
            startIcon={<AddIcon sx={{ fontSize: 16 }} />}
            sx={{ flex: 2, py: 1.25, fontSize: 14, fontWeight: 600, borderRadius: "10px", borderColor: "divider", color: "text.secondary" }}
          >
            Add References
          </Button>
        </Box>
      </Box>

      {/* Filter chips */}
      <Box sx={{ mb: 5 }}>
        <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.18em", color: "text.secondary", mb: 1.5 }}>
          Filter by Trend
        </Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {TREND_FILTERS.map((f) => (
            <Chip
              key={f}
              label={f}
              onClick={() => setActiveFilter(f)}
              variant={activeFilter === f ? "filled" : "outlined"}
              sx={{
                borderRadius: "8px",
                fontWeight: 500,
                ...(activeFilter === f
                  ? { bgcolor: "#241918", color: "#fff", "&:hover": { bgcolor: "#3a2724" } }
                  : { borderColor: "divider", color: "text.secondary", "&:hover": { borderColor: "#dfbfbc" } }),
              }}
            />
          ))}
        </Box>
      </Box>

      {/* Generated concepts */}
      <Box>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
          <Typography sx={{ fontSize: 22, fontWeight: 700 }}>Generated Concepts</Typography>
          {moodboard?.status === "done" && (
            <Button variant="outlined" size="small" onClick={() => navigate(`/moodboards/${moodboard._id}`)}>
              View Full Board
            </Button>
          )}
        </Box>

        {polling && moodboard?.status !== "done" && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Generating your concepts — this takes about 30–60 seconds…
            </Typography>
            <LinearProgress color="primary" />
          </Box>
        )}

        {moodboard?.status === "done" && moodboard.moodboard ? (
          <MoodboardViewer data={moodboard.moodboard as Parameters<typeof MoodboardViewer>[0]["data"]} />
        ) : (
          <Grid container spacing={2.5}>
            {CONCEPT_PLACEHOLDERS.map((c) => (
              <Grid key={c.label} size={{ xs: 12, sm: 4 }}>
                <Box
                  sx={{
                    position: "relative", borderRadius: "12px", overflow: "hidden",
                    border: "1px solid", borderColor: "divider", cursor: "pointer",
                    "&:hover": { borderColor: "primary.main" }, transition: "border-color 0.15s",
                  }}
                >
                  <Box sx={{ height: 220, bgcolor: "#fff0ef" }} />
                  <Box
                    sx={{
                      position: "absolute", top: 12, right: 12,
                      bgcolor: "#241918", color: "#fff", fontSize: 12, fontWeight: 700,
                      px: 1.25, py: 0.5, borderRadius: "6px",
                    }}
                  >
                    {c.match}% match
                  </Box>
                  <Box sx={{ p: 2, bgcolor: "#fff" }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 600, color: "text.primary" }}>{c.label}</Typography>
                    <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.25 }}>Click to explore concept</Typography>
                  </Box>
                </Box>
              </Grid>
            ))}
          </Grid>
        )}
      </Box>
    </PageShell>
  );
}
