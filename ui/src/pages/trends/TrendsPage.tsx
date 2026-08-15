import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Box, Button, Grid, Paper, Skeleton, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import TrendingUpOutlinedIcon from "@mui/icons-material/TrendingUpOutlined";
import { PageShell } from "../../components/PageShell";
import { PageHeader } from "../../components/PageHeader";
import { getCentoireAPI } from "../../lib/api/generated/client";
import type { TrendSheet, TrendSheetSummary } from "../../lib/api/generated/model";
import { applyTrendFilters, parseTrendFilters, serializeTrendFilters, type TrendFilters } from "../../lib/trend-filters";
import { TrendsSectionTabs } from "./components/TrendsSectionTabs";
import { TrendKpiRow } from "./components/TrendKpiRow";
import { TrendFilterBar } from "./components/TrendFilterBar";
import { TrendReportCard } from "./components/TrendReportCard";

const api = getCentoireAPI();

export function TrendsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [summaries, setSummaries] = useState<TrendSheetSummary[]>([]);
  const [sheets, setSheets] = useState<Record<string, TrendSheet | null>>({});
  const [loading, setLoading] = useState(true);
  const [loadingSheets, setLoadingSheets] = useState(true);
  const [error, setError] = useState("");

  const filters = useMemo(() => parseTrendFilters(searchParams), [searchParams]);

  function setFilters(next: TrendFilters) {
    setSearchParams(serializeTrendFilters(next));
  }

  async function loadBrands() {
    setLoading(true);
    setLoadingSheets(true);
    try {
      const data = await api.getApiV1Trends();
      setSummaries(data);
      setLoading(false);
      // fetch full sheets in parallel for chart previews — dataset is small
      // (a handful of brands), so this is cheap and gives real chart data.
      const entries = await Promise.all(
        data.map(async (s) => {
          try {
            return [s.brand_slug, await api.getApiV1TrendsBrandSlug(s.brand_slug)] as const;
          } catch {
            return [s.brand_slug, null] as const;
          }
        }),
      );
      setSheets(Object.fromEntries(entries));
    } catch {
      setError("Failed to load trend reports");
      setLoading(false);
    } finally {
      setLoadingSheets(false);
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadBrands(); }, []);

  const filtered = applyTrendFilters(summaries, filters);

  function openBrand(brandSlug: string) {
    const dimsQuery = filters.dims.length ? `?dims=${filters.dims.join(",")}` : "";
    navigate(`/trends/${brandSlug}${dimsQuery}`);
  }

  return (
    <PageShell title="Trends">
      <PageHeader
        eyebrow="Trend Analysis Engine"
        heading="Runway Trend Sheets"
        description="Recency-weighted signals per brand — dominance, signature values, and rising/fading momentum."
      />

      <TrendsSectionTabs value="reports" />

      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 3 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate("/trends/generate")}>
          Generate New Report
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Skeleton variant="rectangular" height={40} sx={{ mb: 3, borderRadius: 2 }} />
      ) : summaries.length === 0 ? (
        <Paper sx={{ p: 5, textAlign: "center" }}>
          <TrendingUpOutlinedIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
          <Typography color="text.secondary">No trend reports available yet.</Typography>
        </Paper>
      ) : (
        <>
          <TrendFilterBar summaries={summaries} filters={filters} onChange={setFilters} />
          <TrendKpiRow filtered={filtered} total={summaries.length} />

          {filtered.length === 0 ? (
            <Paper sx={{ p: 5, textAlign: "center" }}>
              <Typography color="text.secondary">No reports match the current filters.</Typography>
            </Paper>
          ) : (
            <Grid container spacing={2.5}>
              {filtered.map((s, i) => (
                <Grid key={s.brand_slug} size={{ xs: 12, sm: 6, md: 4 }}>
                  <TrendReportCard
                    summary={s}
                    sheet={sheets[s.brand_slug]}
                    loadingSheet={loadingSheets}
                    index={i}
                    onClick={() => openBrand(s.brand_slug)}
                  />
                </Grid>
              ))}
            </Grid>
          )}
        </>
      )}
    </PageShell>
  );
}
