import { useEffect, useRef, useState } from "react";
import { Box, Grid, Paper, Typography } from "@mui/material";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import StyleOutlinedIcon from "@mui/icons-material/StyleOutlined";
import CompareArrowsOutlinedIcon from "@mui/icons-material/CompareArrowsOutlined";
import CheckroomOutlinedIcon from "@mui/icons-material/CheckroomOutlined";
import { PageShell } from "../../components/PageShell";
import { PageHeader } from "../../components/PageHeader";
import { getCentoireAPI } from "../../lib/api/generated/client";
import type { TrendSheet, TrendSheetSummary } from "../../lib/api/generated/model";
import { useTrendGeneration } from "../../hooks/useTrendGeneration";
import { TrendsSectionTabs } from "./components/TrendsSectionTabs";
import { FlowSelectorCard } from "./components/FlowSelectorCard";
import { BrandReportForm } from "./components/BrandReportForm";
import { GenerationTranscript } from "./components/GenerationTranscript";

const api = getCentoireAPI();

type FlowKey = "season" | "brand" | "compare" | "byo";

const FLOWS: Array<{ key: FlowKey; title: string; description: string; Icon: typeof CalendarMonthOutlinedIcon; enabled: boolean }> = [
  { key: "season", title: "Season-Wide", description: "What's trending across the industry this season.", Icon: CalendarMonthOutlinedIcon, enabled: false },
  { key: "brand", title: "Brand Report", description: "A recency-weighted trend report for a single brand.", Icon: StyleOutlinedIcon, enabled: true },
  { key: "compare", title: "Compare Brands", description: "Contrast trend signals between two brands.", Icon: CompareArrowsOutlinedIcon, enabled: false },
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
  const prevStatusRef = useRef(gen.status);

  useEffect(() => {
    api.getApiV1Trends().then(setBrands).catch(() => setBrands([]));
  }, []);

  // archive the previous finished/errored turn into history right before a new one starts
  useEffect(() => {
    if (prevStatusRef.current === "streaming" && gen.status === "idle") {
      // reset() was called explicitly — nothing to archive
    }
    prevStatusRef.current = gen.status;
  }, [gen.status]);

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
        <GenerationTranscript
          history={history}
          currentBrand={currentBrand}
          status={gen.status}
          events={gen.events}
          sheet={gen.sheet}
          error={gen.error}
          onRetry={handleRetry}
        />

        {selectedFlow === "brand" ? (
          <Paper sx={{ p: 2.5 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 1.5, color: "text.secondary" }}>
              Brand Report
            </Typography>
            <BrandReportForm brands={brands} disabled={gen.status === "streaming"} onSubmit={handleSubmit} />
          </Paper>
        ) : (
          <Paper sx={{ p: 2.5, textAlign: "center" }}>
            <Typography color="text.secondary">This flow isn't wired up yet — coming soon.</Typography>
          </Paper>
        )}
      </Box>
    </PageShell>
  );
}
