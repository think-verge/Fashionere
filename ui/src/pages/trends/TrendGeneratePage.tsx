import { useEffect, useState } from "react";
import { Alert, Box, Grid, LinearProgress, Paper, Typography } from "@mui/material";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import StyleOutlinedIcon from "@mui/icons-material/StyleOutlined";
import CompareArrowsOutlinedIcon from "@mui/icons-material/CompareArrowsOutlined";
import CheckroomOutlinedIcon from "@mui/icons-material/CheckroomOutlined";
import { PageShell } from "../../components/PageShell";
import { PageHeader } from "../../components/PageHeader";
import { getCentoireAPI } from "../../lib/api/generated/client";
import type { TrendSheet, TrendSheetSummary } from "../../lib/api/generated/model";
import { http } from "../../lib/api/http";
import { useTrendGeneration } from "../../hooks/useTrendGeneration";
import { TrendsSectionTabs } from "./components/TrendsSectionTabs";
import { FlowSelectorCard } from "./components/FlowSelectorCard";
import { BrandReportForm } from "./components/BrandReportForm";
import { GenerationTranscript } from "./components/GenerationTranscript";
import { CompareBrandsForm } from "./components/CompareBrandsForm";
import { SeasonWideForm, type SeasonOption } from "./components/SeasonWideForm";
import { ComparisonReportCard, type CompareResponse } from "./components/ComparisonReportCard";
import { SeasonReportCard, type SeasonResponse } from "./components/SeasonReportCard";

const api = getCentoireAPI();

type FlowKey = "season" | "brand" | "compare" | "byo";

const FLOWS: Array<{ key: FlowKey; title: string; description: string; Icon: typeof CalendarMonthOutlinedIcon; enabled: boolean }> = [
  { key: "season", title: "Season-Wide", description: "How brands compare across one season.", Icon: CalendarMonthOutlinedIcon, enabled: true },
  { key: "brand", title: "Brand Report", description: "A recency-weighted trend report for a single brand.", Icon: StyleOutlinedIcon, enabled: true },
  { key: "compare", title: "Compare Brands", description: "Contrast trend signals between two brands.", Icon: CompareArrowsOutlinedIcon, enabled: true },
  { key: "byo", title: "Bring Your Own", description: "Check if an outfit you upload is trending.", Icon: CheckroomOutlinedIcon, enabled: false },
];

interface HistoryEntry {
  brandSlug: string;
  sheet: TrendSheet | null;
  error: string | null;
}

export function TrendGeneratePage() {
  const [selectedFlow, setSelectedFlow] = useState<FlowKey>("brand");
  const [brands, setBrands] = useState<TrendSheetSummary[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [currentBrand, setCurrentBrand] = useState<string | null>(null);
  const gen = useTrendGeneration();

  // on-demand comparison flows (non-streaming request/response)
  const [seasonOptions, setSeasonOptions] = useState<SeasonOption[]>([]);
  const [compareResult, setCompareResult] = useState<CompareResponse | null>(null);
  const [seasonResult, setSeasonResult] = useState<SeasonResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    api.getApiV1Trends().then(setBrands).catch(() => setBrands([]));
    http.get<{ seasons: SeasonOption[] }>("/api/v1/trends/season/options")
      .then((r) => setSeasonOptions(r.data.seasons))
      .catch(() => setSeasonOptions([]));
  }, []);

  function handleSubmit(brandSlug: string) {
    if (currentBrand && (gen.status === "done" || gen.status === "error")) {
      setHistory((prev) => [...prev, { brandSlug: currentBrand, sheet: gen.sheet, error: gen.error }]);
    }
    setCurrentBrand(brandSlug);
    gen.generate(brandSlug);
  }

  function handleRetry() {
    if (currentBrand) gen.generate(currentBrand);
  }

  async function runCompare(a: string, b: string) {
    setBusy(true); setErrMsg(null); setCompareResult(null);
    try {
      const r = await http.get<CompareResponse>("/api/v1/trends/compare", { params: { a, b } });
      setCompareResult(r.data);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Failed to load comparison");
    } finally {
      setBusy(false);
    }
  }

  async function runSeason(o: SeasonOption) {
    setBusy(true); setErrMsg(null); setSeasonResult(null);
    try {
      const r = await http.get<SeasonResponse>("/api/v1/trends/season", {
        params: { year: o.year, season: o.season, category: o.category },
      });
      setSeasonResult(r.data);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Failed to load season report");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell title="Trends">
      <PageHeader
        eyebrow="Trend Analysis Engine"
        heading="Generate a Live Report"
        description="Choose what you want analyzed, and watch the report build in real time."
      />

      <TrendsSectionTabs value="generate" />

      <Grid container spacing={2} sx={{ mb: 4 }}>
        {FLOWS.map((flow) => (
          <Grid key={flow.key} size={{ xs: 12, sm: 6, md: 3 }}>
            <FlowSelectorCard
              title={flow.title}
              description={flow.description}
              Icon={flow.Icon}
              enabled={flow.enabled}
              selected={selectedFlow === flow.key}
              onClick={() => setSelectedFlow(flow.key)}
            />
          </Grid>
        ))}
      </Grid>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {selectedFlow === "brand" && (
          <>
            <GenerationTranscript
              history={history}
              currentBrand={currentBrand}
              status={gen.status}
              events={gen.events}
              sheet={gen.sheet}
              error={gen.error}
              onRetry={handleRetry}
            />
            <Paper sx={{ p: 2.5 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 1.5, color: "text.secondary" }}>Brand Report</Typography>
              <BrandReportForm brands={brands} disabled={gen.status === "streaming"} onSubmit={handleSubmit} />
            </Paper>
          </>
        )}

        {selectedFlow === "compare" && (
          <>
            <Paper sx={{ p: 2.5 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 1.5, color: "text.secondary" }}>Compare Brands</Typography>
              <CompareBrandsForm brands={brands} disabled={busy} onSubmit={runCompare} />
            </Paper>
            {busy && <LinearProgress />}
            {errMsg && <Alert severity="error">{errMsg}</Alert>}
            {compareResult && <ComparisonReportCard data={compareResult} />}
          </>
        )}

        {selectedFlow === "season" && (
          <>
            <Paper sx={{ p: 2.5 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 1.5, color: "text.secondary" }}>Season-Wide</Typography>
              <SeasonWideForm options={seasonOptions} disabled={busy} onSubmit={runSeason} />
            </Paper>
            {busy && <LinearProgress />}
            {errMsg && <Alert severity="error">{errMsg}</Alert>}
            {seasonResult && <SeasonReportCard data={seasonResult} />}
          </>
        )}

        {selectedFlow === "byo" && (
          <Paper sx={{ p: 2.5, textAlign: "center" }}>
            <Typography color="text.secondary">This flow isn't wired up yet — coming soon.</Typography>
          </Paper>
        )}
      </Box>
    </PageShell>
  );
}
