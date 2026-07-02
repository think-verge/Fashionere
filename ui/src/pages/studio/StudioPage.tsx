import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, Button, Alert, Fade } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { PageShell } from "../../components/PageShell";
import { MoodboardViewer } from "../../components/MoodboardViewer";
import { MoodboardWizard, type WizardSelections } from "../../components/MoodboardWizard";
import { GeneratingExperience } from "../../components/GeneratingExperience";
import { getCentoireAPI } from "../../lib/api/generated/client";
import type { Moodboard } from "../../lib/api/generated/model";

const api = getCentoireAPI();

type Phase = "wizard" | "generating" | "done" | "error";

// Converts WizardSelections into a compact human-readable summary line
function buildSummaryLine(s: WizardSelections): string {
  const AGE: Record<string, string> = { "gen-z": "Gen Z", "millennial": "Millennial", "gen-x": "Gen X", "mature": "Mature 45+" };
  const CAT: Record<string, string> = {
    "luxury": "Luxury", "contemporary": "Contemporary", "fast-fashion": "Fast Fashion",
    "casual": "Casual", "sportswear": "Sportswear", "beachwear": "Beachwear",
    "streetwear": "Streetwear", "workwear": "Workwear",
  };
  const SEASON: Record<string, string> = { "ss26": "SS26", "aw26": "AW26", "resort26": "Resort 26", "pf26": "Pre-Fall 26" };
  const parts = [
    CAT[s.category] ?? s.category,
    AGE[s.ageGroup] ?? s.ageGroup,
    SEASON[s.season] ?? s.season,
    ...s.occasion.slice(0, 2).map((o) => o.charAt(0).toUpperCase() + o.slice(1)),
    ...s.aesthetic.slice(0, 2).map((a) => a.charAt(0).toUpperCase() + a.slice(1)),
  ];
  return parts.join(" · ");
}

export function StudioPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("wizard");
  const [selections, setSelections] = useState<WizardSelections | null>(null);
  const [summaryLine, setSummaryLine] = useState("");
  const [moodboard, setMoodboard] = useState<Moodboard | null>(null);
  const [error, setError] = useState("");
  const [agentDone, setAgentDone] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  function stopPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
  }

  useEffect(() => () => stopPolling(), []);

  async function handleGenerate(sel: WizardSelections, prompt: string) {
    setSelections(sel);
    setSummaryLine(buildSummaryLine(sel));
    setError("");
    setAgentDone(false);
    setPhase("generating");

    try {
      const doc = await api.postApiV1MoodboardsFromQuery({ query: prompt });
      setMoodboard(doc);
      startPolling(doc._id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start generation");
      setPhase("error");
    }
  }

  function startPolling(id: string) {
    pollRef.current = setInterval(async () => {
      try {
        const doc = await api.getApiV1MoodboardsId(id);
        setMoodboard(doc);
        if (doc.status === "done") {
          stopPolling();
          setAgentDone(true);
          // Small delay so the last animation step can complete gracefully
          setTimeout(() => setPhase("done"), 900);
        } else if (doc.status === "error") {
          stopPolling();
          setError(doc.error ?? "Generation failed");
          setPhase("error");
        }
      } catch {
        stopPolling();
        setError("Lost connection to server");
        setPhase("error");
      }
    }, 2500);
  }

  function resetWizard() {
    stopPolling();
    setPhase("wizard");
    setSelections(null);
    setMoodboard(null);
    setError("");
    setAgentDone(false);
  }

  return (
    <PageShell title="Studio">
      {phase === "wizard" && (
        <Fade in timeout={350}>
          <Box>
            <Box sx={{ mb: 6 }}>
              <Typography
                sx={{
                  color: "primary.main",
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.2em",
                  mb: 2,
                }}
              >
                Inspiration Engine
              </Typography>
              <Typography
                sx={{
                  fontSize: { xs: 32, md: 44 },
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.1,
                  mb: 2,
                  color: "text.primary",
                }}
              >
                Build a moodboard
              </Typography>
              <Typography
                sx={{
                  fontFamily: "'Literata', Georgia, serif",
                  fontSize: 16,
                  lineHeight: 1.7,
                  color: "text.secondary",
                  maxWidth: 480,
                }}
              >
                Answer a few questions and we'll generate a full editorial moodboard with trend references, imagery, and creative direction.
              </Typography>
            </Box>

            <MoodboardWizard onGenerate={handleGenerate} />
          </Box>
        </Fade>
      )}

      {phase === "generating" && (
        <Box>
          <GeneratingExperience summary={summaryLine} isComplete={agentDone} />
        </Box>
      )}

      {phase === "error" && (
        <Fade in timeout={350}>
          <Box sx={{ maxWidth: 560 }}>
            <Alert severity="error" sx={{ mb: 3, borderRadius: "12px" }}>
              {error}
            </Alert>
            <Button variant="outlined" onClick={resetWizard} sx={{ borderRadius: "10px" }}>
              Start over
            </Button>
          </Box>
        </Fade>
      )}

      {phase === "done" && moodboard?.moodboard && (
        <Fade in timeout={400}>
          <Box>
            {/* Result header */}
            <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 5, gap: 2, flexWrap: "wrap" }}>
              <Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}>
                  <Box
                    sx={{
                      width: 28, height: 28, borderRadius: "8px",
                      bgcolor: "primary.main",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <AutoAwesomeIcon sx={{ fontSize: 14, color: "#fff" }} />
                  </Box>
                  <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.18em", color: "primary.main" }}>
                    Moodboard Ready
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: { xs: 26, md: 34 }, fontWeight: 700, letterSpacing: "-0.02em", color: "text.primary", lineHeight: 1.1, mb: 1 }}>
                  {moodboard.name || "Your Collection Concept"}
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                  {summaryLine.split(" · ").map((tag) => (
                    <Box
                      key={tag}
                      sx={{
                        px: 1.5, py: 0.4, borderRadius: "20px",
                        bgcolor: "#f9f0ef", border: "1px solid #f0e4e2",
                      }}
                    >
                      <Typography sx={{ fontSize: 11, fontWeight: 600, color: "#58413f" }}>{tag}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>

              <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexShrink: 0 }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={resetWizard}
                  sx={{ borderRadius: "10px", borderColor: "divider", color: "text.secondary", fontSize: 13 }}
                >
                  New Moodboard
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  endIcon={<ArrowForwardIcon sx={{ fontSize: 14 }} />}
                  onClick={() => navigate(`/moodboards/${moodboard._id}`)}
                  sx={{ borderRadius: "10px", fontSize: 13 }}
                >
                  View Full Board
                </Button>
              </Box>
            </Box>

            <MoodboardViewer data={moodboard.moodboard as Parameters<typeof MoodboardViewer>[0]["data"]} />
          </Box>
        </Fade>
      )}
    </PageShell>
  );
}
