import { Box, Typography, Grid, Chip, Paper, Divider } from "@mui/material";
import { PaletteStrip } from "./PaletteStrip";
import { TrendBadge } from "./TrendBadge";

interface GeneratedImage {
  url: string;
  kind: string;
  prompt?: string;
}

interface PaletteSwatch {
  hex: string;
  family?: string;
  role?: string;
}

interface TrendBadgeData {
  label: string;
  lifecycle_stage: string;
  confidence_score: number;
  justification?: string;
}

interface MoodboardData {
  narrative?: string;
  keywords?: string[];
  palette?: PaletteSwatch[];
  trend_badges?: TrendBadgeData[];
  badges?: TrendBadgeData[];
  generated_images?: GeneratedImage[];
  hero_images?: GeneratedImage[];
  silhouettes?: GeneratedImage[];
  textures?: GeneratedImage[];
  patterns?: GeneratedImage[];
  details?: GeneratedImage[];
  styling?: GeneratedImage[];
  colorways?: GeneratedImage[];
  category?: string;
}

interface Props {
  data: MoodboardData;
}

export function MoodboardViewer({ data }: Props) {
  const heroImages = data.hero_images ?? data.generated_images?.filter((img) => img.kind === "hero" || !img.kind) ?? [];
  const otherImages = [
    ...(data.silhouettes ?? []),
    ...(data.textures ?? []),
    ...(data.patterns ?? []),
    ...(data.details ?? []),
    ...(data.styling ?? []),
    ...(data.colorways ?? []),
    ...(data.generated_images?.filter((img) => img.kind && img.kind !== "hero") ?? []),
  ];
  const badges = data.badges ?? data.trend_badges ?? [];

  return (
    <Box>
      {heroImages.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="overline" color="text.secondary" sx={{ mb: 1, display: "block" }}>
            Hero Images
          </Typography>
          <Grid container spacing={2}>
            {heroImages.map((img, i) => (
              <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
                <Box
                  component="img"
                  src={img.url}
                  alt={`Hero ${i + 1}`}
                  sx={{ width: "100%", borderRadius: 2, aspectRatio: "4/3", objectFit: "cover" }}
                />
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {otherImages.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="overline" color="text.secondary" sx={{ mb: 1, display: "block" }}>
            Inspiration Tiles
          </Typography>
          <Grid container spacing={1.5}>
            {otherImages.map((img, i) => (
              <Grid key={i} size={{ xs: 6, sm: 4, md: 3 }}>
                <Box sx={{ position: "relative" }}>
                  <Box
                    component="img"
                    src={img.url}
                    alt={img.kind}
                    sx={{ width: "100%", borderRadius: 2, aspectRatio: "1", objectFit: "cover" }}
                  />
                  <Chip
                    label={img.kind}
                    size="small"
                    sx={{
                      position: "absolute",
                      bottom: 6,
                      left: 6,
                      fontSize: 10,
                      height: 18,
                      bgcolor: "rgba(0,0,0,0.7)",
                    }}
                  />
                </Box>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      <Grid container spacing={3}>
        {data.palette && data.palette.length > 0 && (
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper sx={{ p: 2.5 }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
                Color Palette
              </Typography>
              <PaletteStrip swatches={data.palette} size={44} />
            </Paper>
          </Grid>
        )}

        {badges.length > 0 && (
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper sx={{ p: 2.5 }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
                Trend Signals
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {badges.map((badge, i) => (
                  <TrendBadge key={i} lifecycle={badge.lifecycle_stage} label={badge.label} />
                ))}
              </Box>
            </Paper>
          </Grid>
        )}

        {data.narrative && (
          <Grid size={12}>
            <Paper sx={{ p: 2.5 }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                Creative Direction
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>
                {data.narrative}
              </Typography>
              {data.keywords && data.keywords.length > 0 && (
                <>
                  <Divider sx={{ my: 1.5 }} />
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                    {data.keywords.map((kw, i) => (
                      <Chip key={i} label={kw} size="small" variant="outlined" sx={{ fontSize: 11 }} />
                    ))}
                  </Box>
                </>
              )}
            </Paper>
          </Grid>
        )}
      </Grid>
    </Box>
  );
}
