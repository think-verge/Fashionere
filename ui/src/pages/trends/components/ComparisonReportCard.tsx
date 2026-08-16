import { Box, Chip, Paper, Typography } from "@mui/material";
import { EditorialReportView, type EditorialReport } from "./EditorialReportView";

interface Row {
  value: string;
  a_share: number;
  b_share: number;
  delta: number;
  a_momentum: string | null;
  b_momentum: string | null;
}
interface CompareDim {
  divergence_score: number;
  table: Row[];
  shared: { value: string }[];
  distinctive_a: { value: string }[];
  distinctive_b: { value: string }[];
}
export interface CompareResponse {
  brand_a: { slug: string; name: string; total_looks: number };
  brand_b: { slug: string; name: string; total_looks: number };
  dimensions: Record<string, CompareDim>;
  headline: string;
  report?: EditorialReport | null;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function ComparisonReportCard({ data }: { data: CompareResponse }) {
  const A = data.brand_a.name, B = data.brand_b.name;

  const numbers = (dim: string) => {
    const d = data.dimensions[dim];
    if (!d) return null;
    return (
      <Box>
        <Typography sx={{ fontSize: 11, color: "text.secondary", mb: 0.75, textTransform: "uppercase", letterSpacing: 0.5 }}>
          By the numbers · divergence {d.divergence_score.toFixed(2)}
        </Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 0.5, mb: 1 }}>
          {d.table.slice(0, 4).map((r) => (
            <Typography key={r.value} sx={{ fontSize: 12.5, color: "text.secondary" }}>
              <b style={{ color: "#1c1a19" }}>{r.value}</b> — {A} {pct(r.a_share)} · {B} {pct(r.b_share)}
            </Typography>
          ))}
        </Box>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
          {d.shared.map((s) => <Chip key={`sh-${s.value}`} size="small" variant="outlined" label={`shared · ${s.value}`} />)}
          {d.distinctive_a.map((s) => <Chip key={`a-${s.value}`} size="small" label={`${A} · ${s.value}`} sx={{ bgcolor: "#f7d9d2" }} />)}
          {d.distinctive_b.map((s) => <Chip key={`b-${s.value}`} size="small" label={`${B} · ${s.value}`} sx={{ bgcolor: "#dbe2e8" }} />)}
        </Box>
      </Box>
    );
  };

  if (data.report) {
    return <EditorialReportView eyebrow={`${A}  ✕  ${B}`} report={data.report} renderNumbers={numbers} />;
  }

  // fallback if narration is unavailable — headline + the numeric footnotes only
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Paper sx={{ p: 2.5, bgcolor: "#fff0ef" }}>
        <Typography variant="overline" color="primary">{A} ✕ {B}</Typography>
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
