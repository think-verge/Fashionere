import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Box, Typography, Paper, Chip, Skeleton, Alert,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import { api } from "../../lib/api/client";

interface TrendElement {
  kind: "color" | "fabric" | "pattern";
  family: string;
  stats: {
    count: number;
    total: number;
    rank: number;
    stage: "now" | "next" | "emg";
    brands: string[];
  };
  verdict: { tag: string; pursue: string; body: string };
  designer_cue: string;
  evidence: Array<{
    look_id: string;
    brand: string;
    piece: string;
    image_url: string | null;
    garment_id: string;
  }>;
  image_url?: string | null;
  hex?: string;
}

const STAGE_META: Record<string, { bg: string; fg: string; label: string; long: string }> = {
  now: { bg: "#e8f5e9", fg: "#2e7d32", label: "Now", long: "In market now" },
  next: { bg: "#fff3e0", fg: "#e65100", label: "Next", long: "Coming next" },
  emg: { bg: "#ede7f6", fg: "#6a1b9a", label: "Emerging", long: "Emerging" },
};

export default function ElementTrendPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const kind = params.get("kind") as "color" | "fabric" | "pattern" | null;
  const family = params.get("family");
  const garmentType = params.get("garment_type");

  const { data: trend, isLoading, error } = useQuery<TrendElement>({
    queryKey: ["element-trend", kind, family, garmentType],
    queryFn: async () => {
      const { data } = await api.get("/retail-trends/element", {
        params: { kind, family, garment_type: garmentType },
      });
      return data;
    },
    enabled: !!kind && !!family && !!garmentType,
  });

  if (!kind || !family || !garmentType) {
    return <Alert severity="error">Missing parameters.</Alert>;
  }

  if (isLoading) {
    return (
      <Box>
        <Skeleton width={180} height={28} sx={{ mb: 2 }} />
        <Skeleton width="60%" height={48} sx={{ mb: 3 }} />
        <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 2, mb: 2 }} />
        <Skeleton variant="rectangular" height={160} sx={{ borderRadius: 2 }} />
      </Box>
    );
  }

  if (error || !trend) {
    return (
      <Box>
        <Box onClick={() => navigate(-1)} sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 3, cursor: "pointer" }}>
          <ArrowBackIcon sx={{ fontSize: 16, color: "text.secondary" }} />
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Back</Typography>
        </Box>
        <Alert severity="warning">Trend data not available for this element.</Alert>
      </Box>
    );
  }

  const stage = STAGE_META[trend.stats.stage] ?? STAGE_META.emg;

  return (
    <Box>
      {/* Back */}
      <Box onClick={() => navigate(-1)} sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 3, cursor: "pointer", width: "fit-content" }}>
        <ArrowBackIcon sx={{ fontSize: 16, color: "text.secondary" }} />
        <Typography sx={{ fontSize: 13, color: "text.secondary", "&:hover": { color: "primary.main" }, transition: "color 0.15s" }}>
          Back to garment
        </Typography>
      </Box>

      {/* Header */}
      <Box sx={{ display: "flex", gap: 3, mb: 4, flexDirection: { xs: "column", md: "row" }, alignItems: "flex-start" }}>
        {/* Element visual */}
        {(trend.hex || trend.image_url) && (
          <Box sx={{ width: { xs: "100%", md: 200 }, flexShrink: 0 }}>
            {trend.kind === "color" && trend.hex ? (
              <Box sx={{
                width: "100%",
                height: 160,
                borderRadius: "14px",
                bgcolor: trend.hex,
                border: "1px solid rgba(0,0,0,0.06)",
              }} />
            ) : trend.image_url ? (
              <Box
                component="img"
                src={trend.image_url}
                alt={trend.family}
                sx={{
                  width: "100%",
                  height: 160,
                  objectFit: "cover",
                  borderRadius: "14px",
                }}
              />
            ) : null}
          </Box>
        )}

        {/* Title + verdict */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "text.disabled", mb: 0.5 }}>
            {kind} trend · {garmentType}
          </Typography>
          <Typography sx={{
            fontFamily: "'Literata', Georgia, serif",
            fontSize: { xs: 28, md: 36 },
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "text.primary",
            lineHeight: 1.1,
            mb: 2,
          }}>
            {trend.family}
          </Typography>

          {/* Verdict tag */}
          <Box sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 1,
            px: 2,
            py: 1,
            borderRadius: "10px",
            bgcolor: stage.bg,
            mb: 2,
          }}>
            <TrendingUpIcon sx={{ fontSize: 18, color: stage.fg }} />
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: stage.fg }}>
                {trend.verdict.tag}
              </Typography>
              <Typography sx={{ fontSize: 11, color: stage.fg, opacity: 0.85 }}>
                {stage.long}
              </Typography>
            </Box>
          </Box>

          <Typography sx={{ fontSize: 14, color: "text.secondary", lineHeight: 1.6, maxWidth: 520 }}>
            {trend.verdict.pursue}
          </Typography>
        </Box>
      </Box>

      {/* Stats row */}
      <Box sx={{
        display: "flex",
        gap: 2,
        mb: 4,
        flexWrap: "wrap",
      }}>
        <StatCard label="Appearances" value={`${trend.stats.count} of ${trend.stats.total}`} />
        <StatCard label="Brands" value={trend.stats.brands.join(", ") || "—"} />
        <StatCard label="Rank" value={`#${trend.stats.rank + 1}`} />
        <StatCard label="Pipeline stage" value={stage.label} color={stage.fg} />
      </Box>

      {/* Why it's trending */}
      <Paper sx={{ p: 3, borderRadius: "14px", border: "1px solid #f0e4e2", mb: 3 }}>
        <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.18em", color: "text.disabled", mb: 1.5 }}>
          Why it's trending
        </Typography>
        <Typography sx={{
          fontSize: 15,
          color: "text.primary",
          lineHeight: 1.7,
          fontFamily: "'Literata', Georgia, serif",
        }}>
          {trend.verdict.body}
        </Typography>
      </Paper>

      {/* Designer cue */}
      <Paper sx={{
        p: 3,
        borderRadius: "14px",
        bgcolor: "#faf8f7",
        border: "1px solid #f0e4e2",
        mb: 4,
      }}>
        <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.18em", color: "primary.main", mb: 1 }}>
          Designer cue
        </Typography>
        <Typography sx={{
          fontSize: 14,
          color: "text.primary",
          lineHeight: 1.6,
          fontStyle: "italic",
          fontFamily: "'Literata', Georgia, serif",
        }}>
          {trend.designer_cue}
        </Typography>
      </Paper>

      {/* Seen on — evidence rail */}
      {trend.evidence.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.18em", color: "text.disabled", mb: 2 }}>
            Seen on
          </Typography>
          <Box sx={{
            display: "flex",
            gap: 2,
            overflowX: "auto",
            pb: 1,
            "&::-webkit-scrollbar": { height: 4 },
            "&::-webkit-scrollbar-thumb": { bgcolor: "#e8dedd", borderRadius: 2 },
          }}>
            {trend.evidence.map((ev, i) => (
              <Paper
                key={i}
                component={Link}
                to={`/app/looks/${ev.look_id}/garment/${ev.garment_id}`}
                sx={{
                  flexShrink: 0,
                  width: 160,
                  borderRadius: "12px",
                  overflow: "hidden",
                  border: "1px solid #f0e4e2",
                  textDecoration: "none",
                  transition: "border-color 0.15s, transform 0.15s",
                  "&:hover": { borderColor: "#dfbfbc", transform: "translateY(-2px)" },
                }}
              >
                {ev.image_url ? (
                  <Box
                    component="img"
                    src={ev.image_url}
                    alt={ev.brand}
                    sx={{ width: "100%", height: 180, objectFit: "cover", display: "block" }}
                  />
                ) : (
                  <Box sx={{ width: "100%", height: 180, bgcolor: "#f5f0ef" }} />
                )}
                <Box sx={{ p: 1.5 }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.primary" }} noWrap>
                    {ev.brand}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: "text.secondary" }} noWrap>
                    {ev.piece}
                  </Typography>
                </Box>
              </Paper>
            ))}
          </Box>
        </Box>
      )}

      {/* Link to category overview */}
      <Box
        onClick={() => navigate(`/app/trends/retail/${encodeURIComponent(garmentType)}`)}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 1,
          px: 2.5,
          py: 1.25,
          borderRadius: "10px",
          border: "1px solid #f0e4e2",
          cursor: "pointer",
          transition: "all 0.15s",
          "&:hover": { borderColor: "primary.main", bgcolor: "#fff0ef" },
        }}
      >
        <TrendingUpIcon sx={{ fontSize: 16, color: "primary.main" }} />
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: "text.primary" }}>
          View all {garmentType.toLowerCase()} trends →
        </Typography>
      </Box>
    </Box>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Paper sx={{
      px: 2.5,
      py: 2,
      borderRadius: "12px",
      border: "1px solid #f0e4e2",
      minWidth: 120,
      flex: "1 1 120px",
    }}>
      <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: "text.disabled", mb: 0.5 }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 16, fontWeight: 600, color: color ?? "text.primary", textTransform: "capitalize" }}>
        {value}
      </Typography>
    </Paper>
  );
}
