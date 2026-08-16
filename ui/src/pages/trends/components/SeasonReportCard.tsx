import { Box, Chip, Paper, Typography } from "@mui/material";
import { EditorialReportView, type EditorialReport } from "./EditorialReportView";
import { brandLabel } from "./TrendReportCard";

interface ConsensusItem {
  value: string;
  avg_share: number;
  brands_with_it: number;
  shares: Record<string, number>;
}
interface Outlier { brand: string; value: string; share: number; vs_season_avg: number }
interface SeasonDim {
  spread_index: number;
  consensus: ConsensusItem[];
  outliers: Outlier[];
}
export interface SeasonResponse {
  season: { year: number; season: string; category: string; brands: string[]; total_looks: number };
  dimensions: Record<string, SeasonDim>;
  headline: string;
  report?: EditorialReport | null;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const signed = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}pt`;

export function SeasonReportCard({ data }: { data: SeasonResponse }) {
  const s = data.season;
  const eyebrow = `${s.season} ${s.year} · ${s.category.toUpperCase()} · ${s.brands.map(brandLabel).join(", ")}`;

  const numbers = (dim: string) => {
    const d = data.dimensions[dim];
    if (!d) return null;
    return (
      <Box>
        <Typography sx={{ fontSize: 11, color: "text.secondary", mb: 0.75, textTransform: "uppercase", letterSpacing: 0.5 }}>
          By the numbers · {d.spread_index >= 0.15 ? "divergent" : "aligned"} {d.spread_index.toFixed(2)}
        </Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 0.5, mb: 1 }}>
          {d.consensus.slice(0, 4).map((c) => (
            <Typography key={c.value} sx={{ fontSize: 12.5, color: "text.secondary" }}>
              <b style={{ color: "#1c1a19" }}>{c.value}</b> — avg {pct(c.avg_share)}
              {" · "}{s.brands.map((b) => `${brandLabel(b)} ${pct(c.shares[b] ?? 0)}`).join(" · ")}
            </Typography>
          ))}
        </Box>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
          {d.outliers.slice(0, 4).map((o, i) => (
            <Chip key={i} size="small" variant="outlined"
              color={o.vs_season_avg >= 0 ? "primary" : "default"}
              label={`${brandLabel(o.brand)} · ${o.value} ${signed(o.vs_season_avg)}`} />
          ))}
        </Box>
      </Box>
    );
  };

  if (data.report) {
    return <EditorialReportView eyebrow={eyebrow} report={data.report} renderNumbers={numbers} />;
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Paper sx={{ p: 2.5, bgcolor: "#fff0ef" }}>
        <Typography variant="overline" color="primary">{eyebrow}</Typography>
        <Typography sx={{ fontWeight: 600 }}>{data.headline}</Typography>
      </Paper>
      {Object.keys(data.dimensions).map((dim) => (
        <Paper key={dim} sx={{ p: 2.5 }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1, textTransform: "capitalize" }}>{dim}</Typography>
          {numbers(dim)}
        </Paper>
      ))}
    </Box>
  );
}
