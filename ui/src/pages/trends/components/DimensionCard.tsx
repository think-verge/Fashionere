import { Box, LinearProgress, Paper, Typography } from "@mui/material";
import { PaletteStrip } from "../../../components/PaletteStrip";
import { TrendBadge } from "../../../components/TrendBadge";
import type { DimensionAggregate } from "../../../lib/api/generated/model";

export const DIMENSION_ORDER = ["colors", "fabrics", "patterns", "silhouettes", "themes", "details"];
export const DIMENSION_LABELS: Record<string, string> = {
  colors: "Colors",
  fabrics: "Fabrics",
  patterns: "Patterns",
  silhouettes: "Silhouettes",
  themes: "Themes",
  details: "Details",
};

export function DimensionCard({ dimKey, dim }: { dimKey: string; dim: DimensionAggregate }) {
  return (
    <Paper sx={{ p: 2.5 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 2 }}>
        <Typography variant="subtitle2" fontWeight={700}>
          {DIMENSION_LABELS[dimKey] ?? dimKey}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {dim.total_looks} looks
        </Typography>
      </Box>

      {dim.palette.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <PaletteStrip
            swatches={dim.palette.map((p) => ({ hex: p.hex, family: p.family, role: p.pantone ?? undefined }))}
            size={40}
          />
        </Box>
      )}

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        {dim.ranked.slice(0, 6).map((rv) => (
          <Box key={rv.value}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{rv.value}</Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                {rv.momentum && <TrendBadge lifecycle={rv.momentum.kind} />}
                <Typography sx={{ fontSize: 12, color: "text.secondary", minWidth: 32, textAlign: "right" }}>
                  {Math.round(rv.share * 100)}%
                </Typography>
              </Box>
            </Box>
            <LinearProgress
              variant="determinate"
              value={rv.share * 100}
              sx={{ height: 4, borderRadius: 2, bgcolor: "#f0e4e2", "& .MuiLinearProgress-bar": { bgcolor: "primary.main" } }}
            />
          </Box>
        ))}
      </Box>
    </Paper>
  );
}
