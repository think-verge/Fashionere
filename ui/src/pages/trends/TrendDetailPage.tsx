import { useEffect, useState } from "react";
import { Link as RouterLink, useParams, useSearchParams } from "react-router-dom";
import { Alert, Box, Link, Skeleton, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { PageShell } from "../../components/PageShell";
import { PageHeader } from "../../components/PageHeader";
import { getCentoireAPI } from "../../lib/api/generated/client";
import type { TrendSheet } from "../../lib/api/generated/model";
import { DIMENSION_ORDER, DimensionCard } from "./components/DimensionCard";

const api = getCentoireAPI();

export function TrendDetailPage() {
  const { brandSlug } = useParams<{ brandSlug: string }>();
  const [searchParams] = useSearchParams();
  const [sheet, setSheet] = useState<TrendSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const dimsFilter = searchParams.get("dims")?.split(",").filter(Boolean) ?? [];

  async function loadSheet() {
    if (!brandSlug) return;
    setLoading(true);
    setError("");
    try {
      setSheet(await api.getApiV1TrendsBrandSlug(brandSlug));
    } catch {
      setError("Failed to load this brand's trend sheet");
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadSheet(); }, [brandSlug]);

  const allDimensionKeys = sheet
    ? [...DIMENSION_ORDER.filter((k) => k in sheet.dimensions), ...Object.keys(sheet.dimensions).filter((k) => !DIMENSION_ORDER.includes(k))]
    : [];
  const dimensionKeys = dimsFilter.length ? allDimensionKeys.filter((k) => dimsFilter.includes(k)) : allDimensionKeys;

  return (
    <PageShell title="Trends">
      <Link component={RouterLink} to="/trends" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, mb: 3, fontSize: 13, fontWeight: 600 }}>
        <ArrowBackIcon sx={{ fontSize: 16 }} /> Back to Reports
      </Link>

      <PageHeader
        eyebrow="Trend Analysis Engine"
        heading={sheet ? sheet.brand : "Trend Report"}
        description={sheet ? `Window ${sheet.window_years.join("–")} · ${sheet.total_looks} looks across ${sheet.collections} collections` : undefined}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {sheet?.report?.headline && (
        <Box sx={{ mb: 4 }}>
          <Typography sx={{ fontSize: 22, fontWeight: 700, mb: 0.5 }}>{sheet.report.headline}</Typography>
          {sheet.report.standfirst && (
            <Typography sx={{ fontFamily: "'Literata', Georgia, serif", color: "text.secondary" }}>
              {sheet.report.standfirst}
            </Typography>
          )}
        </Box>
      )}

      {loading ? (
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 2.5 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={220} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      ) : sheet ? (
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 2.5 }}>
          {dimensionKeys.map((key) => (
            <DimensionCard key={key} dimKey={key} dim={sheet.dimensions[key]} />
          ))}
        </Box>
      ) : null}
    </PageShell>
  );
}
