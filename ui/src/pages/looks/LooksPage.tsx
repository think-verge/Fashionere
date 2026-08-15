import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Box, Chip, Grid, Paper, Skeleton, Typography } from "@mui/material";
import CollectionsIcon from "@mui/icons-material/CollectionsOutlined";
import { PageShell } from "../../components/PageShell";
import { PageHeader } from "../../components/PageHeader";
import { getCentoireAPI } from "../../lib/api/generated/client";
import type { LookSummary } from "../../lib/api/generated/model";

const api = getCentoireAPI();

function brandLabel(slug: string | null): string {
  if (!slug) return "Unknown";
  return slug.split("-").map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");
}

export function LooksPage() {
  const navigate = useNavigate();
  const [looks, setLooks] = useState<LookSummary[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadLooks(brand: string | null) {
    setLoading(true);
    try {
      const data = await api.getApiV1Looks(brand ? { brand } : undefined);
      setLooks(data);
      if (brand === null) {
        setBrands(Array.from(new Set(data.map((l) => l.brand).filter((b): b is string => Boolean(b)))).sort());
      }
    } catch {
      setError("Failed to load deconstructed looks");
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadLooks(selectedBrand); }, [selectedBrand]);

  const filterChips = useMemo(
    () => [{ label: "All", value: null as string | null }, ...brands.map((b) => ({ label: brandLabel(b), value: b }))],
    [brands],
  );

  return (
    <PageShell title="Looks">
      <PageHeader
        eyebrow="Deconstruction Engine"
        heading="Deconstructed Looks"
        description="Runway looks broken down into color palettes, fabric swatches, patterns, and technical flats — per garment."
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {brands.length > 0 && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 3 }}>
          {filterChips.map((chip) => (
            <Chip
              key={chip.label}
              label={chip.label}
              size="small"
              color={selectedBrand === chip.value ? "primary" : "default"}
              variant={selectedBrand === chip.value ? "filled" : "outlined"}
              onClick={() => setSelectedBrand(chip.value)}
            />
          ))}
        </Box>
      )}

      <Grid container spacing={2.5}>
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <Grid key={i} size={{ xs: 12, sm: 6, md: 3 }}>
                <Skeleton variant="rectangular" height={220} sx={{ borderRadius: 2 }} />
              </Grid>
            ))
          : looks.length === 0
          ? (
              <Grid size={12}>
                <Paper sx={{ p: 5, textAlign: "center" }}>
                  <CollectionsIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
                  <Typography color="text.secondary">No deconstructed looks yet.</Typography>
                </Paper>
              </Grid>
            )
          : looks.map((look) => (
              <Grid key={look.look_id} size={{ xs: 12, sm: 6, md: 3 }}>
                <Paper
                  onClick={() => navigate(`/looks/${encodeURIComponent(look.look_id)}`)}
                  sx={{ cursor: "pointer", overflow: "hidden", transition: "border-color 0.2s", "&:hover": { borderColor: "primary.main" } }}
                >
                  <Box
                    sx={{
                      height: 160,
                      bgcolor: "rgba(169,53,51,0.06)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                    }}
                  >
                    {look.runway_url ? (
                      <Box component="img" src={look.runway_url} alt={look.look_id} sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <CollectionsIcon sx={{ fontSize: 32, opacity: 0.25 }} />
                    )}
                  </Box>
                  <Box sx={{ p: 2 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>
                      {brandLabel(look.brand)}
                    </Typography>
                    <Box sx={{ display: "flex", gap: 0.5, mt: 1 }}>
                      <Chip label={`${look.num_garments} garments`} size="small" variant="outlined" sx={{ fontSize: 10, height: 20 }} />
                      {look.has_flats && <Chip label="flats" size="small" sx={{ fontSize: 10, height: 20 }} />}
                    </Box>
                  </Box>
                </Paper>
              </Grid>
            ))}
      </Grid>
    </PageShell>
  );
}
