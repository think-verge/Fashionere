import { useState } from "react";
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Grid,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  Divider,
  Chip,
} from "@mui/material";
import CalculateIcon from "@mui/icons-material/Calculate";
import { PageShell } from "../../components/PageShell";
import { getCentoireAPI } from "../../lib/api/generated/client";
import type { CostEstimate, CostInput, CostInputComplexity, CostInputMarket } from "../../lib/api/generated/model";

const api = getCentoireAPI();

const CATEGORIES = ["dresses", "denim", "t-shirts", "swimwear", "jackets", "knitwear", "accessories"];
const FABRIC_TYPES = ["Cotton", "Linen", "Silk", "Polyester", "Wool", "Cashmere", "Denim", "Leather", "Synthetic blend"];

export function CostCalculatorPage() {
  const [form, setForm] = useState<CostInput>({
    category: "dresses",
    quantity: 100,
    fabricType: "Cotton",
    complexity: "moderate",
    market: "mid",
  });
  const [result, setResult] = useState<CostEstimate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function update<K extends keyof CostInput>(key: K, value: CostInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setResult(null);
  }

  async function calculate() {
    setError("");
    setLoading(true);
    try {
      const estimate = await api.postApiV1CostEstimate(form);
      setResult(estimate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Calculation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell title="Cost Calculator">
      <Typography color="text.secondary" variant="body2" sx={{ mb: 3 }}>
        Estimate production costs for your garment designs based on category, fabric, and market tier.
      </Typography>

      <Grid container spacing={3} sx={{ maxWidth: 900 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 3 }}>
              Garment Specifications
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Category</InputLabel>
                <Select value={form.category} label="Category" onChange={(e) => update("category", e.target.value)}>
                  {CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </Select>
              </FormControl>

              <TextField
                label="Quantity"
                type="number"
                size="small"
                value={form.quantity}
                onChange={(e) => update("quantity", parseInt(e.target.value, 10) || 1)}
                inputProps={{ min: 1 }}
                fullWidth
              />

              <FormControl fullWidth size="small">
                <InputLabel>Fabric Type</InputLabel>
                <Select value={form.fabricType} label="Fabric Type" onChange={(e) => update("fabricType", e.target.value)}>
                  {FABRIC_TYPES.map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
                </Select>
              </FormControl>

              <FormControl fullWidth size="small">
                <InputLabel>Complexity</InputLabel>
                <Select
                  value={form.complexity}
                  label="Complexity"
                  onChange={(e) => update("complexity", e.target.value as CostInputComplexity)}
                >
                  <MenuItem value="simple">Simple — basic construction</MenuItem>
                  <MenuItem value="moderate">Moderate — standard details</MenuItem>
                  <MenuItem value="complex">Complex — intricate techniques</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth size="small">
                <InputLabel>Market Tier</InputLabel>
                <Select
                  value={form.market}
                  label="Market Tier"
                  onChange={(e) => update("market", e.target.value as CostInputMarket)}
                >
                  <MenuItem value="budget">Budget</MenuItem>
                  <MenuItem value="mid">Mid-market</MenuItem>
                  <MenuItem value="premium">Premium</MenuItem>
                  <MenuItem value="luxury">Luxury</MenuItem>
                </Select>
              </FormControl>

              <Button
                variant="contained"
                size="large"
                startIcon={<CalculateIcon />}
                onClick={calculate}
                disabled={loading}
                fullWidth
              >
                {loading ? "Calculating…" : "Calculate Cost"}
              </Button>
            </Box>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {result && (
            <Paper sx={{ p: 3 }}>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 3 }}>
                Cost Estimate
              </Typography>

              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 1 }}>
                <Typography color="text.secondary" variant="body2">Per Unit</Typography>
                <Typography variant="h4" fontWeight={700} color="primary">
                  ${result.totalPerUnit}
                </Typography>
              </Box>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 3 }}>
                <Typography color="text.secondary" variant="body2">Total ({form.quantity} units)</Typography>
                <Typography variant="h5" fontWeight={600}>
                  ${result.totalForQuantity.toLocaleString()}
                </Typography>
              </Box>

              <Divider sx={{ mb: 2 }} />

              <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: "block" }}>
                COST BREAKDOWN (per unit)
              </Typography>
              {[
                { label: "Fabric", value: result.breakdown.fabric },
                { label: "Labor", value: result.breakdown.labor },
                { label: "Overhead", value: result.breakdown.overhead },
                { label: "Packaging", value: result.breakdown.packaging },
              ].map((item) => (
                <Box key={item.label} sx={{ display: "flex", justifyContent: "space-between", py: 0.75 }}>
                  <Typography variant="body2" color="text.secondary">{item.label}</Typography>
                  <Typography variant="body2" fontWeight={600}>${item.value}</Typography>
                </Box>
              ))}

              <Divider sx={{ my: 2 }} />
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Chip label={form.category} size="small" />
                <Chip label={form.complexity} size="small" />
                <Chip label={form.market} size="small" />
                <Chip label={form.fabricType} size="small" />
              </Box>
            </Paper>
          )}

          {!result && !error && (
            <Paper
              sx={{
                p: 4,
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 300,
              }}
            >
              <Typography color="text.secondary" variant="body2" textAlign="center">
                Fill in the specifications and click Calculate to see your cost estimate.
              </Typography>
            </Paper>
          )}
        </Grid>
      </Grid>
    </PageShell>
  );
}
