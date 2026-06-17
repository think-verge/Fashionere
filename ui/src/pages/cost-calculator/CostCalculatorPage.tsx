import { useState } from "react";
import {
  Box, Typography, Button, Paper, Table, TableHead, TableBody,
  TableRow, TableCell, LinearProgress, Grid,
} from "@mui/material";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import ShareOutlinedIcon from "@mui/icons-material/ShareOutlined";
import AcUnitOutlinedIcon from "@mui/icons-material/AcUnitOutlined";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import { PageShell } from "../../components/PageShell";

const GARMENT = { name: "Structured Wool Overcoat", ref: "#TP-042" };

const TIERS = [
  { label: "Tier 1", units: 50 },
  { label: "Tier 2", units: 250 },
  { label: "Tier 3", units: 500 },
  { label: "Tier 4", units: 1000 },
];

const BOM = [
  { name: "Virgin Wool Blend",    spec: "380gsm · Centoire Salmon", source: "Vitale Barberis, IT",  usage: "2.8m",    prices: [84.00, 72.50, 68.00, 62.00] },
  { name: "Bemberg Cupro",        spec: "Signature Jacquard",       source: "Asahi Kasei, JP",      usage: "2.2m",    prices: [15.40, 13.20, 12.50, 11.80] },
  { name: "Genuine Horn Buttons", spec: "24L · Matte Raisin",       source: "Gritti, IT",           usage: "6 units", prices: [4.80,  4.20,  3.60,  3.10]  },
  { name: "CMT / Assembly",       spec: "High-End Tailoring",       source: "Atelier Centoire, PT", usage: "1 unit",  prices: [55.00, 48.00, 42.00, 38.00] },
];

const TOTALS = TIERS.map((_, ti) => +BOM.reduce((s, r) => s + r.prices[ti], 0).toFixed(2));
const RETAIL_MULTIPLIER = 3.5;

export function CostCalculatorPage() {
  const [activeTier, setActiveTier] = useState(1);

  const unitCost = TOTALS[activeTier];
  const retail   = +(unitCost * RETAIL_MULTIPLIER).toFixed(2);
  const profit   = +(retail - unitCost).toFixed(2);
  const margin   = Math.round(((retail - unitCost) / retail) * 100);

  return (
    <PageShell title="Cost Calculator">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 5, flexWrap: "wrap", gap: 2 }}>
        <Box>
          <Typography sx={{ fontSize: { xs: 28, md: 44 }, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
            {GARMENT.name}
          </Typography>
          <Typography sx={{ color: "primary.main", fontSize: 20, fontWeight: 700, mt: 0.75 }}>
            {GARMENT.ref}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
          <Button startIcon={<FileDownloadOutlinedIcon />} sx={{ color: "text.secondary", fontWeight: 500 }}>
            Export PDF
          </Button>
          <Button
            variant="contained"
            sx={{ bgcolor: "#241918", borderRadius: "100px", px: 3, py: 1, fontWeight: 600, "&:hover": { bgcolor: "#3a2724" } }}
          >
            Publish to Production
          </Button>
        </Box>
      </Box>

      {/* ── Tier selector ───────────────────────────────────────────────── */}
      <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: "text.secondary", mb: 2 }}>
        Select Order Quantity
      </Typography>
      <Grid container spacing={2} sx={{ mb: 5 }}>
        {TIERS.map((tier, i) => (
          <Grid key={i} size={{ xs: 6, sm: 3 }}>
            <Box
              onClick={() => setActiveTier(i)}
              sx={{
                p: 2.5, borderRadius: "12px", cursor: "pointer", transition: "all 0.15s",
                border: activeTier === i ? "1.5px solid" : "1px solid",
                borderColor: activeTier === i ? "primary.main" : "divider",
                bgcolor: activeTier === i ? "rgba(169,53,51,0.04)" : "#fff",
                "&:hover": { borderColor: activeTier === i ? "primary.main" : "#dfbfbc" },
              }}
            >
              <Typography sx={{ fontSize: 16, fontWeight: 700, color: activeTier === i ? "primary.main" : "text.primary" }}>
                {tier.label}
              </Typography>
              <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.5 }}>
                {tier.units} units
              </Typography>
            </Box>
          </Grid>
        ))}
      </Grid>

      {/* ── BOM Table ───────────────────────────────────────────────────── */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Typography sx={{ fontSize: 22, fontWeight: 700 }}>Bill of Materials &amp; Cost Tiers</Typography>
        <Button sx={{ color: "text.secondary", fontSize: 13, gap: 0.5 }}>⚙ Calculator Settings</Button>
      </Box>

      <Paper sx={{ overflow: "hidden", mb: 3 }}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: "#fdf5f4" }}>
              {["Component", "Source", "Usage"].map((h) => (
                <TableCell key={h} sx={{ fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.secondary" }}>
                  {h}
                </TableCell>
              ))}
              {TIERS.map((tier, i) => (
                <TableCell key={i} align="right" sx={{ fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: activeTier === i ? "primary.main" : "text.secondary" }}>
                  {tier.label}
                  <Typography component="span" sx={{ display: "block", fontSize: 10, fontWeight: 400, letterSpacing: 0, textTransform: "none" }}>
                    ({tier.units})
                  </Typography>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {BOM.map((row) => (
              <TableRow key={row.name} sx={{ "&:last-child td": { borderBottom: 0 } }}>
                <TableCell sx={{ width: "26%" }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{row.name}</Typography>
                  <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.25 }}>{row.spec}</Typography>
                </TableCell>
                <TableCell sx={{ fontSize: 13, color: "text.secondary" }}>{row.source}</TableCell>
                <TableCell sx={{ fontSize: 13, color: "text.secondary" }}>{row.usage}</TableCell>
                {row.prices.map((p, i) => (
                  <TableCell key={i} align="right" sx={{ fontSize: 14, fontWeight: activeTier === i ? 700 : 400, color: activeTier === i ? "primary.main" : "text.primary" }}>
                    ${p.toFixed(2)}
                  </TableCell>
                ))}
              </TableRow>
            ))}

            {/* Total row */}
            <TableRow>
              <TableCell colSpan={3} sx={{ bgcolor: "#241918", borderBottom: 0, py: 2.5 }}>
                <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: "rgba(255,255,255,0.65)" }}>
                  Total Manufacturing Cost
                </Typography>
              </TableCell>
              {TOTALS.map((total, i) => (
                <TableCell key={i} align="right" sx={{ bgcolor: "#241918", borderBottom: 0, fontSize: 15, fontWeight: 700, color: activeTier === i ? "#ff9b8a" : "rgba(255,255,255,0.85)" }}>
                  ${total.toFixed(2)}
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      </Paper>

      {/* ── Bottom analysis row ─────────────────────────────────────────── */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 5 }}>
          <Paper sx={{ bgcolor: "#241918 !important", p: 3.5, height: "100%", minHeight: 180, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "rgba(255,255,255,0.38)" }}>
              Landed Cost Forecast
            </Typography>
            <Box>
              <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.5, mb: 1 }}>
                Est. Unit Cost<br />Selected tier · duties incl.
              </Typography>
              <Typography sx={{ fontSize: 44, fontWeight: 700, color: "primary.light", lineHeight: 1 }}>
                ${unitCost.toFixed(2)}
              </Typography>
            </Box>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 7 }}>
          <Paper sx={{ p: 3.5, height: "100%" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2.5 }}>
              <TrendingDownIcon sx={{ color: "primary.main", fontSize: 20 }} />
              <Typography sx={{ fontSize: 18, fontWeight: 700 }}>Margin Analysis</Typography>
            </Box>

            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.75 }}>
                <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Gross Margin</Typography>
                <Typography sx={{ fontSize: 20, fontWeight: 700, color: "#006c4d" }}>{margin}%</Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={margin}
                sx={{ height: 8, borderRadius: 4, bgcolor: "#f0e4e2", "& .MuiLinearProgress-bar": { bgcolor: "#006c4d", borderRadius: 4 } }}
              />
            </Box>

            <Grid container spacing={2}>
              {[
                { label: "Cost / Unit",           value: `$${unitCost.toFixed(2)}`, color: "text.primary"  },
                { label: `Retail (${RETAIL_MULTIPLIER}×)`, value: `$${retail.toFixed(2)}`,   color: "text.secondary" },
                { label: "Profit",                value: `$${profit.toFixed(2)}`,   color: "#006c4d"       },
              ].map((item) => (
                <Grid key={item.label} size={{ xs: 4 }}>
                  <Typography sx={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.secondary", mb: 0.5 }}>
                    {item.label}
                  </Typography>
                  <Typography sx={{ fontSize: 20, fontWeight: 700, color: item.color }}>
                    {item.value}
                  </Typography>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Grid>
      </Grid>

      {/* ── Optimization tip ────────────────────────────────────────────── */}
      <Paper sx={{ p: 2.5, display: "flex", alignItems: "flex-start", gap: 2 }}>
        <Box sx={{ width: 40, height: 40, borderRadius: "10px", bgcolor: "rgba(169,53,51,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <TrendingDownIcon sx={{ color: "primary.main", fontSize: 20 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 700, mb: 0.5 }}>Cost Optimization Tip</Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary", lineHeight: 1.6 }}>
            By increasing your {TIERS[activeTier].label} order by 15%, you unlock an additional 4% discount on the Virgin Wool shell fabric due to bulk shipping efficiencies from Vitale Barberis.
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1.5, flexShrink: 0, alignItems: "center", flexWrap: "wrap" }}>
          <Button startIcon={<ShareOutlinedIcon />} variant="outlined" size="small" sx={{ borderColor: "divider", color: "text.secondary" }}>
            Share with Supplier
          </Button>
          <Button startIcon={<AcUnitOutlinedIcon />} variant="contained" size="small" sx={{ bgcolor: "#241918", "&:hover": { bgcolor: "#3a2724" } }}>
            Freeze BOM
          </Button>
        </Box>
      </Paper>
    </PageShell>
  );
}
