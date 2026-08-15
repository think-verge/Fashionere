import { useEffect, useState } from "react";
import { Alert, Box, Chip, LinearProgress, Paper, Skeleton, Typography } from "@mui/material";
import { PageShell } from "../../components/PageShell";
import { PageHeader } from "../../components/PageHeader";
import { PaletteStrip } from "../../components/PaletteStrip";
import { TrendBadge } from "../../components/TrendBadge";
import { getCentoireAPI } from "../../lib/api/generated/client";
import type { DimensionAggregate, TrendSheet, TrendSheetSummary } from "../../lib/api/generated/model";

const api = getCentoireAPI();

const DIMENSION_ORDER = ["colors", "fabrics", "patterns", "silhouettes", "themes", "details"];
const DIMENSION_LABELS: Record<string, string> = {
  colors: "Colors",
  fabrics: "Fabrics",
  patterns: "Patterns",
  silhouettes: "Silhouettes",
  themes: "Themes",
  details: "Details",
};

function brandLabel(slug: string): string {
  return slug.split("-").map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");
}

function DimensionCard({ dimKey, dim }: { dimKey: string; dim: DimensionAggregate }) {
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

export function TrendsPage() {
  const [brands, setBrands] = useState<TrendSheetSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [sheet, setSheet] = useState<TrendSheet | null>(null);
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [error, setError] = useState("");

  async function loadBrands() {
    try {
      const data = await api.getApiV1Trends();
      setBrands(data);
      if (data.length > 0) setSelected(data[0].brand_slug);
    } catch {
      setError("Failed to load trend brands");
    } finally {
      setLoadingBrands(false);
    }
  }

  async function loadSheet(brandSlug: string) {
    setLoadingSheet(true);
    setError("");
    try {
      setSheet(await api.getApiV1TrendsBrandSlug(brandSlug));
    } catch {
      setError("Failed to load this brand's trend sheet");
    } finally {
      setLoadingSheet(false);
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadBrands(); }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (selected) loadSheet(selected); }, [selected]);

  const dimensionKeys = sheet
    ? [...DIMENSION_ORDER.filter((k) => k in sheet.dimensions), ...Object.keys(sheet.dimensions).filter((k) => !DIMENSION_ORDER.includes(k))]
    : [];

  return (
    <PageShell title="Trends">
      <PageHeader
        eyebrow="Trend Analysis Engine"
        heading="Runway Trend Sheets"
        description="Recency-weighted signals per brand — dominance, signature values, and rising/fading momentum."
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loadingBrands ? (
        <Skeleton variant="rectangular" height={40} sx={{ mb: 3, borderRadius: 2 }} />
      ) : brands.length === 0 ? (
        <Alert severity="info">No trend sheets available yet.</Alert>
      ) : (
        <>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 4 }}>
            {brands.map((b) => (
              <Chip
                key={b.brand_slug}
                label={`${brandLabel(b.brand_slug)} (${b.total_looks})`}
                size="small"
                color={selected === b.brand_slug ? "primary" : "default"}
                variant={selected === b.brand_slug ? "filled" : "outlined"}
                onClick={() => setSelected(b.brand_slug)}
              />
            ))}
          </Box>

          {loadingSheet ? (
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 2.5 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} variant="rectangular" height={220} sx={{ borderRadius: 2 }} />
              ))}
            </Box>
          ) : sheet ? (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                {sheet.brand} · window {sheet.window_years.join("–")} · {sheet.total_looks} looks across {sheet.collections} collections
              </Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 2.5 }}>
                {dimensionKeys.map((key) => (
                  <DimensionCard key={key} dimKey={key} dim={sheet.dimensions[key]} />
                ))}
              </Box>
            </>
          ) : null}
        </>
      )}
    </PageShell>
  );
}
