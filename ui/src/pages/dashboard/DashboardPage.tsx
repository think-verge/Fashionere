import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Grid,
  Typography,
  Paper,
  Button,
  Skeleton,
  Alert,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { PageShell } from "../../components/PageShell";
import { MoodboardCard } from "../../components/MoodboardCard";
import { useAuth } from "../../lib/auth-context";
import { getCentoireAPI } from "../../lib/api/generated/client";
import type { MoodboardSummary } from "../../lib/api/generated/model";

const api = getCentoireAPI();

export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [moodboards, setMoodboards] = useState<MoodboardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getApiV1Moodboards()
      .then((data) => setMoodboards(data.slice(0, 6)))
      .catch(() => setError("Failed to load moodboards"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PageShell title="Dashboard">
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>
          Welcome back, {user?.name?.split(" ")[0]} ✦
        </Typography>
        <Typography color="text.secondary" variant="body2">
          Your fashion intelligence hub
        </Typography>
      </Box>

      <Grid container spacing={2} sx={{ mb: 4 }}>
        {[
          { label: "Open Studio", desc: "Create a new moodboard", path: "/studio", primary: true },
          { label: "Explore Trends", desc: "Browse the latest signals", path: "/trends", primary: false },
          { label: "View Catalogue", desc: "Browse garment types", path: "/catalogue", primary: false },
          { label: "Cost Calculator", desc: "Estimate production costs", path: "/cost-calculator", primary: false },
        ].map((action) => (
          <Grid key={action.path} size={{ xs: 12, sm: 6, md: 3 }}>
            <Paper
              sx={{
                p: 2.5,
                cursor: "pointer",
                transition: "all 0.2s",
                border: action.primary ? "1px solid rgba(201,168,76,0.3)" : "1px solid rgba(255,255,255,0.06)",
                "&:hover": { bgcolor: "rgba(255,255,255,0.04)", transform: "translateY(-1px)" },
              }}
              onClick={() => navigate(action.path)}
            >
              <Typography variant="subtitle2" fontWeight={600} color={action.primary ? "primary" : "text.primary"}>
                {action.label}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {action.desc}
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          Recent Moodboards
        </Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={() => navigate("/studio")}>
          New Board
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={2}>
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
                <Skeleton variant="rectangular" height={220} sx={{ borderRadius: 2 }} />
              </Grid>
            ))
          : moodboards.length === 0
          ? (
              <Grid size={12}>
                <Paper sx={{ p: 5, textAlign: "center" }}>
                  <Typography color="text.secondary" sx={{ mb: 2 }}>
                    No moodboards yet. Open the Studio to create your first one.
                  </Typography>
                  <Button variant="contained" onClick={() => navigate("/studio")}>
                    Open Studio
                  </Button>
                </Paper>
              </Grid>
            )
          : moodboards.map((mb) => (
              <Grid key={mb._id} size={{ xs: 12, sm: 6, md: 4 }}>
                <MoodboardCard moodboard={mb} />
              </Grid>
            ))}
      </Grid>
    </PageShell>
  );
}
