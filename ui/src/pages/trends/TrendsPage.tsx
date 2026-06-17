import { useEffect, useState } from "react";
import {
  Box,
  Grid,
  Paper,
  Typography,
  Chip,
  Alert,
  Skeleton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  LinearProgress,
  Tooltip,
} from "@mui/material";
import { PageShell } from "../../components/PageShell";
import { PageHeader } from "../../components/PageHeader";
import { TrendBadge } from "../../components/TrendBadge";
import { getCentoireAPI } from "../../lib/api/generated/client";

const api = getCentoireAPI();

interface Trend {
  trend_id: string;
  type: string;
  label: string;
  descriptor: string;
  lifecycle_stage: string;
  confidence_score: number;
  context: { category: string; season?: string; market?: string };
  attributes: Record<string, unknown>;
  sources: string[];
}

export function TrendsPage() {
  const [trends, setTrends] = useState<Trend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterLifecycle, setFilterLifecycle] = useState("");
  const [filterType, setFilterType] = useState("");

  async function fetchTrends() {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filterCategory) params.category = filterCategory;
      if (filterLifecycle) params.lifecycle = filterLifecycle;
      if (filterType) params.type = filterType;
      const data = await api.getApiV1Trends(params);
      setTrends(data as unknown as Trend[]);
    } catch {
      setError("Failed to load trends");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchTrends(); }, [filterCategory, filterLifecycle, filterType]);

  return (
    <PageShell title="Trends">
      <PageHeader
        eyebrow="Trend Analysis"
        heading="Market Intelligence"
        description="Real-time signals from runway, retail, and social to inform your next collection."
      />
      <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Category</InputLabel>
          <Select value={filterCategory} label="Category" onChange={(e) => setFilterCategory(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            {["dresses", "denim", "t-shirts", "swimwear"].map((c) => (
              <MenuItem key={c} value={c}>{c}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Lifecycle</InputLabel>
          <Select value={filterLifecycle} label="Lifecycle" onChange={(e) => setFilterLifecycle(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            {["emerging", "rising", "peaking", "fading"].map((l) => (
              <MenuItem key={l} value={l}>{l}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Type</InputLabel>
          <Select value={filterType} label="Type" onChange={(e) => setFilterType(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            {["color", "silhouette", "material", "aesthetic", "pattern", "item_style"].map((t) => (
              <MenuItem key={t} value={t}>{t}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: "block" }}>
        {loading ? "Loading…" : `${trends.length} trends`}
      </Typography>

      <Grid container spacing={2}>
        {loading
          ? Array.from({ length: 12 }).map((_, i) => (
              <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
                <Skeleton variant="rectangular" height={140} sx={{ borderRadius: 2 }} />
              </Grid>
            ))
          : trends.map((trend) => (
              <Grid key={trend.trend_id} size={{ xs: 12, sm: 6, md: 4 }}>
                <Paper sx={{ p: 2 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1 }}>
                    <Typography variant="subtitle2" fontWeight={600}>
                      {trend.label}
                    </Typography>
                    <TrendBadge lifecycle={trend.lifecycle_stage} />
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5, lineHeight: 1.5 }}>
                    {trend.descriptor}
                  </Typography>
                  <Box sx={{ mb: 1 }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">Confidence</Typography>
                      <Typography variant="caption" fontWeight={600}>{trend.confidence_score}%</Typography>
                    </Box>
                    <Tooltip title={`${trend.confidence_score}% confidence`}>
                      <LinearProgress
                        variant="determinate"
                        value={trend.confidence_score}
                        sx={{ height: 4, borderRadius: 2 }}
                        color={trend.confidence_score > 70 ? "success" : trend.confidence_score > 40 ? "warning" : "error"}
                      />
                    </Tooltip>
                  </Box>
                  <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                    <Chip label={trend.type} size="small" variant="outlined" sx={{ fontSize: 10, height: 18 }} />
                    {trend.context.category && (
                      <Chip label={trend.context.category} size="small" variant="outlined" sx={{ fontSize: 10, height: 18 }} />
                    )}
                    {trend.context.season && (
                      <Chip label={trend.context.season} size="small" variant="outlined" sx={{ fontSize: 10, height: 18 }} />
                    )}
                  </Box>
                </Paper>
              </Grid>
            ))}
      </Grid>
    </PageShell>
  );
}
