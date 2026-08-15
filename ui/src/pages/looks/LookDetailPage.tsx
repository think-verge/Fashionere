import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, Box, Button, Grid, Paper, Skeleton, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { PageShell } from "../../components/PageShell";
import { GarmentBreakdown } from "../../components/GarmentBreakdown";
import { getCentoireAPI } from "../../lib/api/generated/client";
import type { LookDetail } from "../../lib/api/generated/model";

const api = getCentoireAPI();

export function LookDetailPage() {
  const { lookId } = useParams<{ lookId: string }>();
  const navigate = useNavigate();
  const [look, setLook] = useState<LookDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadLook() {
    if (!lookId) return;
    setLoading(true);
    try {
      setLook(await api.getApiV1LooksLookId(lookId));
    } catch {
      setError("Failed to load this look");
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadLook(); }, [lookId]);

  if (loading) {
    return (
      <PageShell title="Look">
        <Skeleton variant="rectangular" height={400} sx={{ borderRadius: 2 }} />
      </PageShell>
    );
  }

  if (error || !look) {
    return (
      <PageShell title="Look">
        <Alert severity="error">{error || "Look not found"}</Alert>
      </PageShell>
    );
  }

  return (
    <PageShell title="Look">
      <Box sx={{ maxWidth: 1100, mx: "auto" }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/looks")} size="small" sx={{ mb: 2 }}>
          All Looks
        </Button>

        <Grid container spacing={3} sx={{ mb: 4 }}>
          {look.runway_url && (
            <Grid size={{ xs: 12, sm: 5 }}>
              <Box component="img" src={look.runway_url} alt={look.look_id} sx={{ width: "100%", borderRadius: 2, aspectRatio: "3/4", objectFit: "cover" }} />
            </Grid>
          )}
          <Grid size={{ xs: 12, sm: look.runway_url ? 7 : 12 }}>
            <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5, textTransform: "capitalize" }}>
              {look.brand ?? "Unknown brand"}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {look.collection_id}
            </Typography>
            {look.silhouette && (
              <Typography variant="body2" sx={{ mb: 2, lineHeight: 1.7 }}>
                {look.silhouette}
              </Typography>
            )}
            {look.whole_look_flat && (
              <Paper sx={{ p: 2, display: "inline-block" }}>
                <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                  Whole-look flat
                </Typography>
                <Box component="img" src={look.whole_look_flat} alt="Whole-look technical flat" sx={{ width: 160, borderRadius: 1, bgcolor: "#fff" }} />
              </Paper>
            )}
          </Grid>
        </Grid>

        {look.garments.length === 0 ? (
          <Alert severity="info">No per-garment breakdown recorded for this look yet.</Alert>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
            {look.garments.map((garment, i) => (
              <GarmentBreakdown key={garment.garment_id ?? i} garment={garment} />
            ))}
          </Box>
        )}
      </Box>
    </PageShell>
  );
}
