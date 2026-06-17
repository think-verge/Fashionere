import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Grid,
  Typography,
  Button,
  Alert,
  Skeleton,
  TextField,
  InputAdornment,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import { PageShell } from "../../components/PageShell";
import { MoodboardCard } from "../../components/MoodboardCard";
import { getCentoireAPI } from "../../lib/api/generated/client";
import type { MoodboardSummary } from "../../lib/api/generated/model";

const api = getCentoireAPI();

export function MoodboardsPage() {
  const navigate = useNavigate();
  const [all, setAll] = useState<MoodboardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    api
      .getApiV1Moodboards()
      .then(setAll)
      .catch(() => setError("Failed to load moodboards"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = all.filter((mb) =>
    mb.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <PageShell title="Moodboards">
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <TextField
          size="small"
          placeholder="Search boards…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: 280 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate("/studio")}>
          New Board
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={2}>
        {loading
          ? Array.from({ length: 9 }).map((_, i) => (
              <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
                <Skeleton variant="rectangular" height={220} sx={{ borderRadius: 2 }} />
              </Grid>
            ))
          : filtered.length === 0
          ? (
              <Grid size={12}>
                <Typography color="text.secondary" sx={{ textAlign: "center", py: 5 }}>
                  {search ? "No boards match your search." : "No moodboards yet — create one in the Studio."}
                </Typography>
              </Grid>
            )
          : filtered.map((mb) => (
              <Grid key={mb._id} size={{ xs: 12, sm: 6, md: 4 }}>
                <MoodboardCard moodboard={mb} />
              </Grid>
            ))}
      </Grid>
    </PageShell>
  );
}
