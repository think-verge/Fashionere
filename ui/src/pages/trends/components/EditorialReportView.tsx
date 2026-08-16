import type { ReactNode } from "react";
import { Box, Chip, Paper, Typography } from "@mui/material";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import { DIMENSION_LABELS, DIMENSION_ORDER } from "./DimensionCard";

export interface EditorialSection {
  dimension: string;
  coined_name: string;
  narrative: string;
  designer_cue: string;
}
export interface EditorialReport {
  headline: string;
  standfirst: string;
  at_a_glance: string[];
  sections: EditorialSection[];
  verdict: string;
}

/** Narrative-first layout: headline + standfirst, a coined-name section per dimension
 *  (prose + designer cue), an optional quiet "by the numbers" footnote, and a verdict. */
export function EditorialReportView({
  eyebrow,
  report,
  renderNumbers,
}: {
  eyebrow: string;
  report: EditorialReport;
  renderNumbers?: (dimension: string) => ReactNode;
}) {
  const byDim = new Map(report.sections.map((s) => [s.dimension, s]));
  const dims = DIMENSION_ORDER.filter((d) => byDim.has(d));

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Paper sx={{ p: 3, bgcolor: "#fff0ef" }}>
        <Typography variant="overline" color="primary" sx={{ letterSpacing: 1.2 }}>{eyebrow}</Typography>
        <Typography variant="h4" sx={{ fontWeight: 800, lineHeight: 1.15, my: 0.5 }}>{report.headline}</Typography>
        <Typography sx={{ fontStyle: "italic", color: "text.secondary", fontSize: 16, mb: 1.75 }}>
          {report.standfirst}
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
          {report.at_a_glance.map((g, i) => (
            <Chip key={i} size="small" label={g} sx={{ bgcolor: "#fff" }} />
          ))}
        </Box>
      </Paper>

      {dims.map((dim) => {
        const s = byDim.get(dim)!;
        return (
          <Paper key={dim} sx={{ p: 3 }}>
            <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 1 }}>
              {DIMENSION_LABELS[dim] ?? dim}
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, color: "primary.main", mb: 1 }}>
              {s.coined_name}
            </Typography>
            <Typography sx={{ lineHeight: 1.75, color: "text.primary" }}>{s.narrative}</Typography>

            {s.designer_cue && (
              <Box sx={{ display: "flex", gap: 1, mt: 2, p: 1.5, borderLeft: "3px solid",
                borderColor: "primary.main", bgcolor: "#faf3f1", borderRadius: "0 8px 8px 0" }}>
                <LightbulbOutlinedIcon fontSize="small" color="primary" sx={{ mt: 0.25 }} />
                <Box>
                  <Typography sx={{ fontSize: 11, fontWeight: 700, color: "primary.main", textTransform: "uppercase", letterSpacing: 0.6 }}>
                    Designer cue
                  </Typography>
                  <Typography sx={{ fontSize: 14 }}>{s.designer_cue}</Typography>
                </Box>
              </Box>
            )}

            {renderNumbers && <Box sx={{ mt: 2, pt: 1.5, borderTop: "1px dashed #e6d7d3" }}>{renderNumbers(dim)}</Box>}
          </Paper>
        );
      })}

      {report.verdict && (
        <Paper sx={{ p: 3, bgcolor: "#1c1a19", color: "#fff" }}>
          <Typography sx={{ fontSize: 18, fontStyle: "italic", lineHeight: 1.5 }}>
            &ldquo;{report.verdict}&rdquo;
          </Typography>
        </Paper>
      )}
    </Box>
  );
}
