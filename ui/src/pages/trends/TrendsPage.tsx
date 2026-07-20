import { useEffect, useRef, useState } from "react";
import {
  Box, Typography, Paper, Chip, Button, LinearProgress,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import TuneIcon from "@mui/icons-material/Tune";
import { PageShell } from "../../components/PageShell";
import { useTrendQuery } from "../../hooks/useTrendQuery";

interface Message {
  role: "user" | "ai";
  text: string;
}

const INITIAL_MESSAGE: Message = {
  role: "ai",
  text: "Select your filters below to explore fashion trend signals from runway, retail, and social.",
};

const DEFAULT_RADAR = [
  { label: "Liquid Metal", value: 94 },
  { label: "Structured Sheer", value: 89 },
  { label: "Bio-Sequins", value: 78 },
];

const TREND_TYPES = [
  { value: "colors", label: "Colors" },
  { value: "silhouettes", label: "Silhouettes" },
  { value: "patterns", label: "Patterns" },
  { value: "materials", label: "Materials" },
  { value: "aesthetics", label: "Aesthetics" },
  { value: "brands", label: "Brands" },
];

const LIFECYCLES = [
  { value: "emerging", label: "Emerging" },
  { value: "rising", label: "Rising" },
  { value: "peaking", label: "Peaking" },
  { value: "fading", label: "Fading" },
];

const SEASONS = ["FW24", "SS25", "FW25", "SS26", "SS27"];
const GENDERS = ["Women", "Men", "Unisex"];

function buildQuery(
  types: string[],
  lifecycle: string,
  season: string,
  gender: string,
): string {
  const typeStr = types.length ? types.join(" and ") : "fashion trends";
  const lifecycleStr = lifecycle || "top";
  let q = `What are the ${lifecycleStr} ${typeStr}`;
  if (season) q += ` for ${season}`;
  if (gender) q += ` in ${gender.toLowerCase()}swear`;
  q += "?";
  return q;
}

function buildLabel(
  types: string[],
  lifecycle: string,
  season: string,
  gender: string,
): string {
  const parts: string[] = [];
  if (lifecycle) parts.push(lifecycle.charAt(0).toUpperCase() + lifecycle.slice(1));
  if (types.length) parts.push(types.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(", "));
  else parts.push("All trends");
  if (season) parts.push(season);
  if (gender) parts.push(gender);
  return parts.join(" · ");
}

export function TrendsPage() {
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [lifecycle, setLifecycle] = useState("");
  const [season, setSeason] = useState("");
  const [gender, setGender] = useState("");

  const { answer, trends, isStreaming, error, submit } = useTrendQuery();
  const wasStreamingRef = useRef(false);

  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming) {
      if (error) {
        setMessages((prev) => [
          ...prev,
          { role: "ai", text: `Sorry, something went wrong: ${error}` },
        ]);
      } else if (answer) {
        setMessages((prev) => [...prev, { role: "ai", text: answer }]);
      }
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming]); // eslint-disable-line react-hooks/exhaustive-deps

  const radarItems =
    trends.length > 0
      ? trends
          .slice()
          .sort((a, b) => b.confidence_score - a.confidence_score)
          .slice(0, 3)
          .map((t) => ({ label: t.label, value: t.confidence_score }))
      : DEFAULT_RADAR;

  const radarCenter =
    radarItems.length > 0
      ? Math.round(radarItems.reduce((sum, t) => sum + t.value, 0) / radarItems.length)
      : 91;

  function toggleType(value: string) {
    setSelectedTypes((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  function analyze() {
    if (isStreaming) return;
    const query = buildQuery(selectedTypes, lifecycle, season, gender);
    const label = buildLabel(selectedTypes, lifecycle, season, gender);
    setMessages((prev) => [...prev, { role: "user", text: label }]);
    submit(query);
  }

  const canAnalyze = selectedTypes.length > 0 || lifecycle || season || gender;

  return (
    <PageShell title="Trends">
      <Box sx={{ mb: 5 }}>
        <Typography sx={{ color: "primary.main", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", mb: 2 }}>
          Trend Analysis
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2.5 }}>
          <Typography sx={{ fontSize: { xs: 32, md: 48 }, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1, color: "text.primary" }}>
            Conversational Intelligence
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexShrink: 0 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#006c4d", animation: "pulse 2s infinite", "@keyframes pulse": { "0%,100%": { opacity: 1 }, "50%": { opacity: 0.4 } } }} />
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: "#006c4d", textTransform: "uppercase", letterSpacing: "0.1em" }}>Live</Typography>
          </Box>
        </Box>
        <Typography sx={{ fontFamily: "'Literata', Georgia, serif", fontSize: 17, lineHeight: 1.7, color: "text.secondary", maxWidth: 560 }}>
          Real-time signals from runway, retail, and social to inform your next collection.
        </Typography>
      </Box>

      <Box sx={{ display: "flex", gap: 4, height: "calc(100vh - 360px)", minHeight: 480 }}>
        {/* Left — messages + filter panel */}
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

          {/* Messages */}
          <Box sx={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 2, pb: 2 }}>
            {messages.map((msg, i) => (
              <Box
                key={i}
                sx={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", gap: 1.5 }}
              >
                {msg.role === "ai" && (
                  <Box sx={{ width: 32, height: 32, borderRadius: "10px", bgcolor: "#241918", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, mt: 0.5 }}>
                    <AutoAwesomeIcon sx={{ fontSize: 15, color: "#ff9b8a" }} />
                  </Box>
                )}
                <Paper
                  elevation={0}
                  sx={{
                    maxWidth: "72%", p: 2,
                    ...(msg.role === "user"
                      ? { bgcolor: "#a93533", color: "#fff", borderRadius: "16px 16px 4px 16px" }
                      : { bgcolor: "#fff", borderRadius: "4px 16px 16px 16px" }),
                  }}
                >
                  <Typography sx={{ fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-line", color: msg.role === "user" ? "#fff" : "text.primary" }}>
                    {msg.text}
                  </Typography>
                </Paper>
              </Box>
            ))}

            {/* Streaming bubble */}
            {isStreaming && (
              <Box sx={{ display: "flex", gap: 1.5 }}>
                <Box sx={{ width: 32, height: 32, borderRadius: "10px", bgcolor: "#241918", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, mt: 0.5 }}>
                  <AutoAwesomeIcon sx={{ fontSize: 15, color: "#ff9b8a" }} />
                </Box>
                <Paper elevation={0} sx={{ maxWidth: "72%", p: 2, borderRadius: "4px 16px 16px 16px", bgcolor: "#fff" }}>
                  {answer ? (
                    <Typography sx={{ fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-line", color: "text.primary" }}>
                      {answer}
                    </Typography>
                  ) : (
                    <LinearProgress sx={{ width: 60, height: 3, borderRadius: 2, bgcolor: "#f0e4e2", "& .MuiLinearProgress-bar": { bgcolor: "#a93533" } }} />
                  )}
                </Paper>
              </Box>
            )}
          </Box>

          {/* Filter panel */}
          <Paper
            elevation={0}
            sx={{ p: 2.5, border: "1px solid", borderColor: "divider", borderRadius: "16px", display: "flex", flexDirection: "column", gap: 2 }}
          >
            {/* Trend type */}
            <Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.25 }}>
                <TuneIcon sx={{ fontSize: 13, color: "text.secondary" }} />
                <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "text.secondary" }}>
                  Trend Type
                </Typography>
                <Typography sx={{ fontSize: 10, color: "text.disabled", ml: 0.5 }}>multi-select</Typography>
              </Box>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                {TREND_TYPES.map((t) => {
                  const selected = selectedTypes.includes(t.value);
                  return (
                    <Chip
                      key={t.value}
                      label={t.label}
                      onClick={() => toggleType(t.value)}
                      size="small"
                      sx={{
                        fontSize: 12, fontWeight: selected ? 600 : 400,
                        bgcolor: selected ? "#241918" : "transparent",
                        color: selected ? "#ff9b8a" : "text.secondary",
                        border: "1px solid",
                        borderColor: selected ? "#241918" : "divider",
                        borderRadius: "6px",
                        "&:hover": { bgcolor: selected ? "#3a2520" : "#faf5f4", borderColor: selected ? "#3a2520" : "#d4c5c3" },
                        cursor: "pointer",
                      }}
                    />
                  );
                })}
              </Box>
            </Box>

            {/* Lifecycle + Season + Gender row */}
            <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
              {/* Lifecycle */}
              <Box sx={{ flex: 1, minWidth: 160 }}>
                <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "text.secondary", mb: 1.25 }}>
                  Lifecycle
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                  {LIFECYCLES.map((l) => {
                    const selected = lifecycle === l.value;
                    return (
                      <Chip
                        key={l.value}
                        label={l.label}
                        onClick={() => setLifecycle(selected ? "" : l.value)}
                        size="small"
                        sx={{
                          fontSize: 12, fontWeight: selected ? 600 : 400,
                          bgcolor: selected ? "#a93533" : "transparent",
                          color: selected ? "#fff" : "text.secondary",
                          border: "1px solid",
                          borderColor: selected ? "#a93533" : "divider",
                          borderRadius: "6px",
                          "&:hover": { bgcolor: selected ? "#7d1f1d" : "#faf5f4", borderColor: selected ? "#7d1f1d" : "#d4c5c3" },
                          cursor: "pointer",
                        }}
                      />
                    );
                  })}
                </Box>
              </Box>

              {/* Season */}
              <Box sx={{ flex: 1, minWidth: 160 }}>
                <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "text.secondary", mb: 1.25 }}>
                  Season
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                  {SEASONS.map((s) => {
                    const selected = season === s;
                    return (
                      <Chip
                        key={s}
                        label={s}
                        onClick={() => setSeason(selected ? "" : s)}
                        size="small"
                        sx={{
                          fontSize: 12, fontWeight: selected ? 600 : 400,
                          bgcolor: selected ? "#a93533" : "transparent",
                          color: selected ? "#fff" : "text.secondary",
                          border: "1px solid",
                          borderColor: selected ? "#a93533" : "divider",
                          borderRadius: "6px",
                          "&:hover": { bgcolor: selected ? "#7d1f1d" : "#faf5f4", borderColor: selected ? "#7d1f1d" : "#d4c5c3" },
                          cursor: "pointer",
                        }}
                      />
                    );
                  })}
                </Box>
              </Box>

              {/* Gender */}
              <Box sx={{ minWidth: 120 }}>
                <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "text.secondary", mb: 1.25 }}>
                  Gender
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                  {GENDERS.map((g) => {
                    const selected = gender === g;
                    return (
                      <Chip
                        key={g}
                        label={g}
                        onClick={() => setGender(selected ? "" : g)}
                        size="small"
                        sx={{
                          fontSize: 12, fontWeight: selected ? 600 : 400,
                          bgcolor: selected ? "#a93533" : "transparent",
                          color: selected ? "#fff" : "text.secondary",
                          border: "1px solid",
                          borderColor: selected ? "#a93533" : "divider",
                          borderRadius: "6px",
                          "&:hover": { bgcolor: selected ? "#7d1f1d" : "#faf5f4", borderColor: selected ? "#7d1f1d" : "#d4c5c3" },
                          cursor: "pointer",
                        }}
                      />
                    );
                  })}
                </Box>
              </Box>
            </Box>

            {/* Analyze button */}
            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
              <Button
                variant="contained"
                onClick={analyze}
                disabled={!canAnalyze || isStreaming}
                sx={{
                  bgcolor: "#241918", color: "#ff9b8a", px: 3, py: 1,
                  borderRadius: "10px", textTransform: "none", fontSize: 13, fontWeight: 600,
                  letterSpacing: "0.02em",
                  "&:hover": { bgcolor: "#3a2520" },
                  "&.Mui-disabled": { bgcolor: "#f0e4e2", color: "#bbb" },
                }}
                endIcon={<AutoAwesomeIcon sx={{ fontSize: 15 }} />}
              >
                {isStreaming ? "Analyzing…" : "Analyze Trends"}
              </Button>
            </Box>
          </Paper>
        </Box>

        {/* Right sidebar — Macro Analysis */}
        <Paper
          elevation={0}
          sx={{ width: 280, flexShrink: 0, p: 3, display: "flex", flexDirection: "column", overflow: "auto" }}
        >
          <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.18em", color: "text.secondary", mb: 0.5 }}>
            Macro Analysis
          </Typography>
          <Typography sx={{ fontSize: 16, fontWeight: 700, mb: 3 }}>
            {trends.length > 0 ? "Trend Radar — Live" : "Trend Radar SS27"}
          </Typography>

          <Box sx={{ position: "relative", width: 140, height: 140, mx: "auto", mb: 3 }}>
            {[140, 100, 60].map((size) => (
              <Box
                key={size}
                sx={{
                  position: "absolute", top: "50%", left: "50%",
                  transform: "translate(-50%,-50%)",
                  width: size, height: size, borderRadius: "50%", border: "1px solid #f0e4e2",
                }}
              />
            ))}
            {radarItems.map((t, i) => {
              const angle = (i * 120 - 90) * (Math.PI / 180);
              const r = 54 * (t.value / 100);
              return (
                <Box
                  key={t.label}
                  sx={{
                    position: "absolute", top: "50%", left: "50%",
                    transform: `translate(-50%,-50%) translate(${+(r * Math.cos(angle)).toFixed(1)}px, ${+(r * Math.sin(angle)).toFixed(1)}px)`,
                    width: 10, height: 10, borderRadius: "50%", bgcolor: "primary.main",
                  }}
                />
              );
            })}
            <Box sx={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
              <Typography sx={{ fontSize: 16, fontWeight: 700, lineHeight: 1 }}>{radarCenter}</Typography>
              <Typography sx={{ fontSize: 9, color: "text.secondary" }}>confidence</Typography>
            </Box>
          </Box>

          <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: "text.secondary", mb: 2 }}>
            {trends.length > 0 ? "Top Trends" : "Radar Legend"}
          </Typography>
          {radarItems.map((t) => (
            <Box key={t.label} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
              <Typography sx={{ fontSize: 13, color: "text.primary" }}>{t.label}</Typography>
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: "primary.main" }}>{t.value}%</Typography>
            </Box>
          ))}

          {trends.length > 0 && (
            <Box sx={{ mt: 1, pt: 1, borderTop: "1px solid #f0e4e2" }}>
              <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
                {trends.length} trend{trends.length !== 1 ? "s" : ""} matched
              </Typography>
            </Box>
          )}

          {trends.length === 0 && (
            <Box sx={{ mt: 2, pt: 2, borderTop: "1px solid #f0e4e2" }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.75 }}>
                <Typography sx={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.secondary" }}>
                  Sustainability
                </Typography>
                <Typography sx={{ fontSize: 12, color: "#006c4d", fontWeight: 700 }}>+34%</Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={72}
                sx={{ height: 4, borderRadius: 2, bgcolor: "#f0e4e2", "& .MuiLinearProgress-bar": { bgcolor: "#006c4d" } }}
              />
            </Box>
          )}
        </Paper>
      </Box>
    </PageShell>
  );
}
