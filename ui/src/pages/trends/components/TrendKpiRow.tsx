import { Box, Grid, Paper, Typography } from "@mui/material";
import type { TrendSheetSummary } from "../../../lib/api/generated/model";

interface Props {
  filtered: TrendSheetSummary[];
  total: number;
}

export function TrendKpiRow({ filtered, total }: Props) {
  const looksAnalyzed = filtered.reduce((sum, b) => sum + b.total_looks, 0);
  const years = filtered.flatMap((b) => b.window_years);
  const windowCoverage = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : "—";
  const isFiltered = filtered.length !== total;

  const tiles = [
    { label: "Brands Covered", value: String(filtered.length), caption: isFiltered ? `of ${total} total` : undefined },
    { label: "Looks Analyzed", value: String(looksAnalyzed), caption: undefined },
    { label: "Window Coverage", value: windowCoverage, caption: undefined },
  ];

  return (
    <Grid container spacing={2.5} sx={{ mb: 4 }}>
      {tiles.map((t) => (
        <Grid key={t.label} size={{ xs: 12, sm: 4 }}>
          <Paper sx={{ p: 3 }}>
            <Typography
              sx={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.15em", color: "text.disabled", mb: 1 }}
            >
              {t.label}
            </Typography>
            <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
              <Typography sx={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", color: "text.primary" }}>
                {t.value}
              </Typography>
              {t.caption && (
                <Typography variant="caption" color="text.secondary">
                  {t.caption}
                </Typography>
              )}
            </Box>
          </Paper>
        </Grid>
      ))}
    </Grid>
  );
}
