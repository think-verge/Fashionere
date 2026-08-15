import { Box, Button, Chip, LinearProgress, Link, Paper, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import type { TrendSheet } from "../../../lib/api/generated/model";
import type { TrendStageEvent } from "../../../hooks/useTrendGeneration";
import { brandLabel } from "./TrendReportCard";

const STAGE_LABELS: Record<string, string> = {
  loading_looks: "Loading canonical looks…",
  normalizing: "Tagging looks (colors, fabrics, patterns)…",
  aggregating: "Aggregating recency-weighted trends…",
  narrating: "Writing the narrative report…",
  persisting: "Saving report…",
};

interface HistoryEntry {
  brandSlug: string;
  sheet: TrendSheet | null;
  error: string | null;
}

interface Props {
  history: HistoryEntry[];
  currentBrand: string | null;
  status: "idle" | "streaming" | "done" | "error";
  events: TrendStageEvent[];
  sheet: TrendSheet | null;
  error: string | null;
  onRetry: () => void;
}

function AiAvatar() {
  return (
    <Box
      sx={{
        width: 32, height: 32, borderRadius: "10px", bgcolor: "#241918",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, mt: 0.5,
      }}
    >
      <AutoAwesomeIcon sx={{ fontSize: 15, color: "#ff9b8a" }} />
    </Box>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
      <Paper elevation={0} sx={{ maxWidth: "72%", p: 2, bgcolor: "#a93533", color: "#fff", borderRadius: "16px 16px 4px 16px" }}>
        <Typography sx={{ fontSize: 14 }}>{text}</Typography>
      </Paper>
    </Box>
  );
}

function ReportBubble({ brandSlug, sheet }: { brandSlug: string; sheet: TrendSheet }) {
  return (
    <Box sx={{ display: "flex", gap: 1.5 }}>
      <AiAvatar />
      <Paper elevation={0} sx={{ maxWidth: "80%", p: 2.5, borderRadius: "4px 16px 16px 16px", bgcolor: "#fff" }}>
        {sheet.report?.headline && (
          <Typography sx={{ fontSize: 16, fontWeight: 700, mb: 0.5 }}>{sheet.report.headline}</Typography>
        )}
        {sheet.report?.standfirst && (
          <Typography sx={{ fontFamily: "'Literata', Georgia, serif", fontSize: 13, color: "text.secondary", mb: 1.5 }}>
            {sheet.report.standfirst}
          </Typography>
        )}
        <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1.5 }}>
          {sheet.brand} · window {sheet.window_years.join("–")} · {sheet.total_looks} looks
        </Typography>
        <Link component={RouterLink} to={`/trends/${brandSlug}`} sx={{ fontSize: 13, fontWeight: 600 }}>
          View in dashboard →
        </Link>
      </Paper>
    </Box>
  );
}

function ErrorBubble({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <Box sx={{ display: "flex", gap: 1.5 }}>
      <AiAvatar />
      <Paper elevation={0} sx={{ maxWidth: "72%", p: 2, borderRadius: "4px 16px 16px 16px", bgcolor: "#fff" }}>
        <Typography sx={{ fontSize: 14, color: "error.main", mb: 1.5 }}>
          Sorry, something went wrong: {error}
        </Typography>
        <Button size="small" variant="outlined" onClick={onRetry}>Try again</Button>
      </Paper>
    </Box>
  );
}

function StreamingBubble({ events }: { events: TrendStageEvent[] }) {
  const stageEvents = events.filter((e) => e.type === "stage");
  const latestStage = stageEvents[stageEvents.length - 1];
  const progressEvent = [...events].reverse().find((e) => e.stage === "normalizing_progress");
  const label = latestStage ? STAGE_LABELS[latestStage.stage] ?? latestStage.stage : "Starting…";
  const progressLabel =
    progressEvent && typeof progressEvent.done === "number" && typeof progressEvent.todo === "number"
      ? ` (${progressEvent.done}/${progressEvent.todo})`
      : "";

  return (
    <Box sx={{ display: "flex", gap: 1.5 }}>
      <AiAvatar />
      <Paper elevation={0} sx={{ maxWidth: "72%", p: 2, borderRadius: "4px 16px 16px 16px", bgcolor: "#fff", minWidth: 220 }}>
        <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1 }}>
          {label}
          {progressLabel}
        </Typography>
        <LinearProgress sx={{ height: 3, borderRadius: 2, bgcolor: "#f0e4e2", "& .MuiLinearProgress-bar": { bgcolor: "#a93533" } }} />
      </Paper>
    </Box>
  );
}

export function GenerationTranscript({ history, currentBrand, status, events, sheet, error, onRetry }: Props) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box sx={{ display: "flex", gap: 1.5 }}>
        <AiAvatar />
        <Paper elevation={0} sx={{ maxWidth: "72%", p: 2, borderRadius: "4px 16px 16px 16px", bgcolor: "#fff" }}>
          <Typography sx={{ fontSize: 14 }}>
            Select a flow below and fill in the form to generate a live trend report.
          </Typography>
        </Paper>
      </Box>

      {history.map((h, i) => (
        <Box key={i} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <UserBubble text={`Generate report for ${brandLabel(h.brandSlug)}`} />
          {h.sheet ? (
            <ReportBubble brandSlug={h.brandSlug} sheet={h.sheet} />
          ) : (
            <ErrorBubble error={h.error ?? "Generation failed"} onRetry={onRetry} />
          )}
        </Box>
      ))}

      {status !== "idle" && currentBrand && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <UserBubble text={`Generate report for ${brandLabel(currentBrand)}`} />
          {status === "streaming" && <StreamingBubble events={events} />}
          {status === "done" && sheet && <ReportBubble brandSlug={currentBrand} sheet={sheet} />}
          {status === "error" && <ErrorBubble error={error ?? "Generation failed"} onRetry={onRetry} />}
        </Box>
      )}

      {history.length > 0 && (
        <Box sx={{ mt: 1, display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Typography sx={{ fontSize: 11, color: "text.disabled", mr: 0.5 }}>Recently generated:</Typography>
          {history.map((h, i) => (
            <Chip
              key={i}
              size="small"
              variant="outlined"
              label={brandLabel(h.brandSlug)}
              component={RouterLink}
              to={`/trends/${h.brandSlug}`}
              clickable
              sx={{ fontSize: 11 }}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
