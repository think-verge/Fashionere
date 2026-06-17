import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, Paper, Grid, Button } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { PageShell } from "../../components/PageShell";
import { PageHeader } from "../../components/PageHeader";
import { MoodboardCard } from "../../components/MoodboardCard";
import { getCentoireAPI } from "../../lib/api/generated/client";
import type { MoodboardSummary } from "../../lib/api/generated/model";

const api = getCentoireAPI();

const TEMPLATES = [
  {
    id: "luxury",
    name: "Luxury Minimalist",
    desc: "Refined palettes with architectural silhouettes.",
    colors: ["#a93533", "#241918", "#e8d9c5"],
    palette: [
      { hex: "#a93533", label: "Centoire Salmon" },
      { hex: "#241918", label: "Deep Espresso" },
      { hex: "#e8d9c5", label: "Warm Ivory" },
    ],
  },
  {
    id: "street",
    name: "Urban Street",
    desc: "Bold contrasts with technical edge.",
    colors: ["#241918", "#ff746d", "#9a9a9a"],
    palette: [
      { hex: "#241918", label: "Shadow Black" },
      { hex: "#ff746d", label: "Brick Red" },
      { hex: "#9a9a9a", label: "Urban Grey" },
    ],
  },
  {
    id: "eco",
    name: "Eco-Conscious",
    desc: "Earthy tones and organic material references.",
    colors: ["#006c4d", "#c9b89a", "#3a3632"],
    palette: [
      { hex: "#006c4d", label: "Forest Green" },
      { hex: "#c9b89a", label: "Natural Linen" },
      { hex: "#3a3632", label: "Earth Brown" },
    ],
  },
];

const CUSTOM_COLORS = ["#f0e4e2", "#241918", "#a93533"];

export function MoodboardsPage() {
  const navigate = useNavigate();
  const [activeTemplate, setActiveTemplate] = useState(0);
  const [savedBoards, setSavedBoards] = useState<MoodboardSummary[]>([]);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    api.getApiV1Moodboards().then(setSavedBoards).catch(() => {});
  }, []);

  const tmpl = TEMPLATES[activeTemplate];

  if (showSaved) {
    return (
      <PageShell title="Moodboards">
        <PageHeader
          eyebrow="Creative Tools"
          heading="Mood Board Creator"
          description="Build visual narratives with AI-enhanced templates and customizable palettes."
        />
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 3 }}>
          <Button variant="text" onClick={() => setShowSaved(false)} sx={{ color: "text.secondary" }}>
            ← Back to Creator
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate("/studio")}>
            New Board
          </Button>
        </Box>
        <Grid container spacing={2}>
          {savedBoards.map((mb) => (
            <Grid key={mb._id} size={{ xs: 12, sm: 6, md: 4 }}>
              <MoodboardCard moodboard={mb} />
            </Grid>
          ))}
        </Grid>
      </PageShell>
    );
  }

  return (
    <PageShell title="Moodboards">
      <PageHeader
        eyebrow="Creative Tools"
        heading="Mood Board Creator"
        description="Build visual narratives with AI-enhanced templates and customizable palettes."
      />

      <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1.5, mb: 4 }}>
        {savedBoards.length > 0 && (
          <Button
            variant="outlined"
            size="small"
            sx={{ borderColor: "divider", color: "text.secondary" }}
            onClick={() => setShowSaved(true)}
          >
            My Boards ({savedBoards.length})
          </Button>
        )}
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate("/studio")}>
          New Board
        </Button>
      </Box>

      <Box sx={{ display: "flex", gap: 4 }}>
        {/* Left template sidebar */}
        <Box sx={{ width: 272, flexShrink: 0 }}>
          <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.18em", color: "text.secondary", mb: 2 }}>
            Templates
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, mb: 4 }}>
            {TEMPLATES.map((t, i) => (
              <Paper
                key={t.id}
                onClick={() => setActiveTemplate(i)}
                sx={{
                  p: 2, cursor: "pointer", transition: "all 0.15s",
                  border: activeTemplate === i ? "1.5px solid" : "1px solid",
                  borderColor: activeTemplate === i ? "primary.main" : "divider",
                  bgcolor: activeTemplate === i ? "rgba(169,53,51,0.03)" : "#fff",
                  "&:hover": { borderColor: activeTemplate === i ? "primary.main" : "#dfbfbc" },
                }}
              >
                <Box sx={{ display: "flex", gap: 1, mb: 1.25 }}>
                  {t.colors.map((c) => (
                    <Box key={c} sx={{ width: 22, height: 22, borderRadius: "6px", bgcolor: c, border: "1px solid rgba(0,0,0,0.06)" }} />
                  ))}
                </Box>
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: activeTemplate === i ? "primary.main" : "text.primary" }}>
                  {t.name}
                </Typography>
                <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 0.25, lineHeight: 1.5 }}>
                  {t.desc}
                </Typography>
              </Paper>
            ))}
          </Box>

          <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.18em", color: "text.secondary", mb: 2 }}>
            Custom Colors
          </Typography>
          <Box sx={{ display: "flex", gap: 2 }}>
            {CUSTOM_COLORS.map((c) => (
              <Box key={c} sx={{ textAlign: "center" }}>
                <Box sx={{ width: 44, height: 44, borderRadius: "10px", bgcolor: c, border: "1px solid rgba(0,0,0,0.08)", mb: 0.75 }} />
                <Typography sx={{ fontSize: 10, color: "text.secondary", fontFamily: "monospace" }}>
                  {c.toUpperCase()}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>

        {/* Right preview panel */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* Image placeholder grid */}
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1.5, mb: 2 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Box
                key={i}
                sx={{ height: 140, borderRadius: "10px", bgcolor: "#fff0ef", border: "1px solid #f0e4e2" }}
              />
            ))}
          </Box>

          {/* Color stripe */}
          <Box sx={{ display: "flex", height: 8, borderRadius: "4px", overflow: "hidden", mb: 5 }}>
            {tmpl.colors.map((c) => (
              <Box key={c} sx={{ flex: 1, bgcolor: c }} />
            ))}
          </Box>

          {/* Color Palette */}
          <Typography sx={{ fontSize: 18, fontWeight: 700, mb: 2.5 }}>Color Palette</Typography>
          <Grid container spacing={2}>
            {tmpl.palette.map((p) => (
              <Grid key={p.hex} size={{ xs: 4 }}>
                <Paper sx={{ p: 2.5, textAlign: "center" }}>
                  <Box
                    sx={{
                      width: 64, height: 64, borderRadius: "12px", bgcolor: p.hex,
                      mx: "auto", mb: 1.5, border: "1px solid rgba(0,0,0,0.06)",
                    }}
                  />
                  <Typography sx={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", mb: 0.5 }}>
                    {p.hex.toUpperCase()}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: "text.secondary" }}>{p.label}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Box>
      </Box>
    </PageShell>
  );
}
