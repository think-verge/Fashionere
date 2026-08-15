import { Box, Chip, Paper, Skeleton, Typography } from "@mui/material";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrendSheet, TrendSheetSummary } from "../../../lib/api/generated/model";

const MOMENTUM_COLORS: Record<string, string> = {
  emerging: "#006c4d",
  rising: "#2f80ed",
  steady: "#b8a9a7",
  fading: "#e0a13c",
  dropped: "#a93533",
};

export function brandLabel(slug: string): string {
  return slug.split("-").map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");
}

interface Props {
  summary: TrendSheetSummary;
  sheet?: TrendSheet | null;
  loadingSheet?: boolean;
  index?: number;
  onClick: () => void;
}

export function TrendReportCard({ summary, sheet, loadingSheet, index = 0, onClick }: Props) {
  const palette = sheet?.dimensions.colors?.palette.slice(0, 5) ?? [];
  const paletteTotal = palette.reduce((sum, p) => sum + p.share, 0);
  const pieData = palette.map((p) => ({
    name: p.family,
    hex: p.hex,
    value: p.share,
    pct: paletteTotal ? Math.round((p.share / paletteTotal) * 100) : 0,
  }));

  const momentumMovers = (sheet?.dimensions.colors?.ranked ?? []).slice(0, 4).map((rv) => ({
    name: rv.value,
    share: Math.round(rv.share * 100),
    color: MOMENTUM_COLORS[rv.momentum?.kind ?? "steady"] ?? "#b8a9a7",
  }));

  return (
    <Paper
      onClick={onClick}
      sx={{
        p: 3,
        cursor: "pointer",
        transition: "transform 0.25s ease, box-shadow 0.25s ease, border-color 0.2s ease",
        animation: "trendCardIn 0.4s ease both",
        animationDelay: `${Math.min(index, 8) * 60}ms`,
        "@keyframes trendCardIn": {
          from: { opacity: 0, transform: "translateY(8px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
        "&:hover": {
          borderColor: "primary.main",
          transform: "translateY(-4px)",
          boxShadow: "0 16px 32px -16px rgba(169,53,51,0.28)",
        },
      }}
    >
      <Typography sx={{ fontSize: 17, fontWeight: 700, mb: 0.5 }}>
        {brandLabel(summary.brand_slug)}
      </Typography>
      <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", mb: 2 }}>
        <Chip label={`${summary.total_looks} looks`} size="small" variant="outlined" sx={{ fontSize: 11 }} />
        <Chip label={summary.window_years.join("–")} size="small" variant="outlined" sx={{ fontSize: 11 }} />
      </Box>

      {loadingSheet ? (
        <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
          <Skeleton variant="circular" width={80} height={80} />
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width="80%" />
            <Skeleton variant="text" width="60%" />
            <Skeleton variant="text" width="70%" />
          </Box>
        </Box>
      ) : pieData.length > 0 ? (
        <Box sx={{ display: "flex", gap: 2, alignItems: "center", mb: 2 }}>
          {/* Fixed-size chart, not ResponsiveContainer: ResponsiveContainer's
              first synchronous DOM measurement can race MUI's emotion style
              injection and read a 0/-1 size that never self-corrects. Since
              this donut is always 84x84 (decorative, not resize-sensitive),
              sizing it directly sidesteps that class of bug entirely. */}
          <Box sx={{ width: 84, height: 84, flexShrink: 0 }}>
            <PieChart width={84} height={84}>
              <Pie data={pieData} dataKey="value" innerRadius={26} outerRadius={40} paddingAngle={2} isAnimationActive>
                {pieData.map((d, i) => (
                  <Cell key={i} fill={d.hex} stroke="#fff" strokeWidth={1} />
                ))}
              </Pie>
              <Tooltip formatter={(_v, _n, item) => [`${item.payload.pct}%`, item.payload.name]} />
            </PieChart>
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, minWidth: 0 }}>
            {pieData.map((d, i) => (
              <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: d.hex, flexShrink: 0, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)" }} />
                <Typography sx={{ fontSize: 11, color: "text.secondary", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {d.name} · {d.pct}%
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      ) : null}

      {!loadingSheet && momentumMovers.length > 0 && (
        <Box>
          <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.disabled", mb: 0.75 }}>
            Top Colors — Share
          </Typography>
          <div style={{ width: "100%", height: 84 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={momentumMovers} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }} barCategoryGap={6}>
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis type="category" dataKey="name" hide />
                <Tooltip formatter={(v) => `${v}%`} />
                <Bar dataKey="share" radius={[0, 4, 4, 0]} barSize={12} isAnimationActive>
                  {momentumMovers.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 0.5 }}>
            {momentumMovers.map((d, i) => (
              <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: "2px", bgcolor: d.color, flexShrink: 0 }} />
                <Typography sx={{ fontSize: 10.5, color: "text.secondary" }}>
                  {d.name} {d.share}%
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Paper>
  );
}
