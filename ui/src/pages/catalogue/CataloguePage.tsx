import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Grid,
  Paper,
  Typography,
  Button,
  Alert,
  Skeleton,
  Chip,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { PageShell } from "../../components/PageShell";
import { getCentoireAPI } from "../../lib/api/generated/client";

const api = getCentoireAPI();

interface CatalogueItem {
  catalogue_item_id: string;
  name: string;
  category: string;
  description?: string;
  attributes?: Record<string, unknown>;
}

export function CataloguePage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getApiV1Catalogue()
      .then((data) => setItems(data as unknown as CatalogueItem[]))
      .catch(() => setError("Failed to load catalogue"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PageShell title="Catalogue">
      <Typography color="text.secondary" variant="body2" sx={{ mb: 3 }}>
        Browse garment types and launch AI moodboard generation directly from any item.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={2.5}>
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
                <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 2 }} />
              </Grid>
            ))
          : items.map((item) => (
              <Grid key={item.catalogue_item_id} size={{ xs: 12, sm: 6, md: 4 }}>
                <Paper
                  sx={{
                    p: 3,
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <Box>
                    <Chip
                      label={item.category}
                      size="small"
                      variant="outlined"
                      sx={{ mb: 1.5, fontSize: 11 }}
                    />
                    <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
                      {item.name}
                    </Typography>
                    {item.description && (
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {item.description}
                      </Typography>
                    )}
                    {item.attributes && (
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 2 }}>
                        {Object.entries(item.attributes).slice(0, 4).map(([k, v]) => (
                          <Chip
                            key={k}
                            label={`${k}: ${String(v)}`}
                            size="small"
                            sx={{ fontSize: 10, height: 20 }}
                          />
                        ))}
                      </Box>
                    )}
                  </Box>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<AutoAwesomeIcon />}
                    onClick={() =>
                      navigate(`/studio?catalogueItemId=${item.catalogue_item_id}`)
                    }
                    color="primary"
                  >
                    Open in Studio
                  </Button>
                </Paper>
              </Grid>
            ))}
      </Grid>
    </PageShell>
  );
}
