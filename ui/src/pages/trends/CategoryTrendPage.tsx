import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Box, Typography, Paper, Skeleton, Alert,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import { api } from "../../lib/api/client";

interface TrendElement {
  kind: "color" | "fabric" | "pattern";
  family: string;
  stats: {
    count: number;
    total: number;
    rank: number;
    stage: "now" | "next" | "emg";
    brands: string[];
  };
  verdict: { tag: string; pursue: string; body: string };
  designer_cue: string;
  evidence: Array<{
    look_id: string;
    brand: string;
    piece: string;
    image_url: string | null;
    garment_id: string;
  }>;
  image_url?: string | null;
  hex?: string;
}

interface CategoryOverview {
  garment_type: string;
  total: number;
  colors: TrendElement[];
  fabrics: TrendElement[];
  patterns: TrendElement[];
  silhouettes: Array<{
    look_id: string;
    garment_id: string;
    brand: string;
    piece: string;
    flat_url: string | null;
  }>;
}

const STAGE_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  now: { bg: "#e8f5e9", fg: "#2e7d32", label: "Now" },
  next: { bg: "#fff3e0", fg: "#e65100", label: "Next" },
  emg: { bg: "#ede7f6", fg: "#6a1b9a", label: "Emerging" },
};

export default function CategoryTrendPage() {
  const { garmentType } = useParams<{ garmentType: string }>();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery<CategoryOverview>({
    queryKey: ["category-trend", garmentType],
    queryFn: async () => {
      const { data } = await api.get(`/retail-trends/overview/${garmentType}`);
      return data;
    },
    enabled: !!garmentType,
  });

  if (isLoading) {
    return (
      <Box>
        <Skeleton width={180} height={28} sx={{ mb: 2 }} />
        <Skeleton width="50%" height={48} sx={{ mb: 4 }} />
        {[1, 2, 3].map((i) => (
          <Box key={i} sx={{ mb: 4 }}>
            <Skeleton width={120} height={20} sx={{ mb: 2 }} />
            <Box sx={{ display: "flex", gap: 2 }}>
              {[1, 2, 3].map((j) => <Skeleton key={j} variant="rectangular" width={160} height={200} sx={{ borderRadius: 2 }} />)}
            </Box>
          </Box>
        ))}
      </Box>
    );
  }

  if (error || !data) {
    return (
      <Box>
        <Box onClick={() => navigate(-1)} sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 3, cursor: "pointer" }}>
          <ArrowBackIcon sx={{ fontSize: 16, color: "text.secondary" }} />
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Back</Typography>
        </Box>
        <Alert severity="warning">No trend data available for this garment type.</Alert>
      </Box>
    );
  }

  function elementUrl(el: TrendElement) {
    return `/app/trends/retail/element?kind=${el.kind}&family=${encodeURIComponent(el.family)}&garment_type=${encodeURIComponent(garmentType!)}`;
  }

  return (
    <Box>
      {/* Back */}
      <Box onClick={() => navigate(-1)} sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 3, cursor: "pointer", width: "fit-content" }}>
        <ArrowBackIcon sx={{ fontSize: 16, color: "text.secondary" }} />
        <Typography sx={{ fontSize: 13, color: "text.secondary", "&:hover": { color: "primary.main" }, transition: "color 0.15s" }}>
          Back
        </Typography>
      </Box>

      {/* Header */}
      <Box sx={{ mb: 5 }}>
        <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "text.disabled", mb: 0.5 }}>
          Trend Overview
        </Typography>
        <Typography sx={{
          fontFamily: "'Literata', Georgia, serif",
          fontSize: { xs: 28, md: 40 },
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: "text.primary",
          lineHeight: 1.1,
          mb: 1.5,
        }}>
          {data.garment_type}s, this season.
        </Typography>
        <Typography sx={{ fontSize: 15, color: "text.secondary", maxWidth: 600, lineHeight: 1.6 }}>
          The broad read across every {data.garment_type.toLowerCase()} we've deconstructed — colours, fabrics, and patterns trending now.
          Tap any element to see why it's trending.
        </Typography>
      </Box>

      {/* Trending colours */}
      {data.colors.length > 0 && (
        <TrendSection title="Trending colours" subtitle="by prevalence">
          <Box sx={{ display: "flex", gap: 2.5, flexWrap: "wrap" }}>
            {data.colors.map((el) => {
              const stage = STAGE_COLORS[el.stats.stage] ?? STAGE_COLORS.emg;
              return (
                <Paper
                  key={el.family}
                  component={Link}
                  to={elementUrl(el)}
                  sx={{
                    width: 120,
                    borderRadius: "12px",
                    overflow: "hidden",
                    border: "1px solid #f0e4e2",
                    textDecoration: "none",
                    transition: "border-color 0.15s, transform 0.15s",
                    "&:hover": { borderColor: "#dfbfbc", transform: "translateY(-2px)" },
                  }}
                >
                  <Box sx={{
                    height: 80,
                    bgcolor: el.hex || "#e0d4d2",
                    borderBottom: "1px solid #f0e4e2",
                  }} />
                  <Box sx={{ p: 1.5 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: "text.primary" }} noWrap>
                      {el.family}
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                      <Box sx={{ px: 0.75, py: 0.25, borderRadius: "4px", bgcolor: stage.bg }}>
                        <Typography sx={{ fontSize: 9, fontWeight: 700, color: stage.fg }}>
                          {stage.label}
                        </Typography>
                      </Box>
                      <Typography sx={{ fontSize: 10, color: "text.disabled" }}>
                        {el.stats.count}/{el.stats.total}
                      </Typography>
                    </Box>
                  </Box>
                </Paper>
              );
            })}
          </Box>
        </TrendSection>
      )}

      {/* Trending fabrics */}
      {data.fabrics.length > 0 && (
        <TrendSection title="Trending fabrics" subtitle="what surfaces are moving">
          <Box sx={{ display: "flex", gap: 2.5, overflowX: "auto", pb: 1 }}>
            {data.fabrics.map((el) => {
              const stage = STAGE_COLORS[el.stats.stage] ?? STAGE_COLORS.emg;
              return (
                <Paper
                  key={el.family}
                  component={Link}
                  to={elementUrl(el)}
                  sx={{
                    flexShrink: 0,
                    width: 180,
                    borderRadius: "12px",
                    overflow: "hidden",
                    border: "1px solid #f0e4e2",
                    textDecoration: "none",
                    transition: "border-color 0.15s, transform 0.15s",
                    "&:hover": { borderColor: "#dfbfbc", transform: "translateY(-2px)" },
                  }}
                >
                  {el.image_url ? (
                    <Box
                      component="img"
                      src={el.image_url}
                      alt={el.family}
                      sx={{ width: "100%", height: 140, objectFit: "cover", display: "block" }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <Box sx={{ height: 140, bgcolor: "#f5f0ef", display: "grid", placeItems: "center" }}>
                      <Typography sx={{ fontSize: 11, color: "text.disabled" }}>No swatch</Typography>
                    </Box>
                  )}
                  <Box sx={{ p: 1.5 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: "text.primary" }} noWrap>
                      {el.family}
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                      <Box sx={{ px: 0.75, py: 0.25, borderRadius: "4px", bgcolor: stage.bg }}>
                        <Typography sx={{ fontSize: 9, fontWeight: 700, color: stage.fg }}>
                          {stage.label}
                        </Typography>
                      </Box>
                      <Typography sx={{ fontSize: 10, color: "text.disabled" }}>
                        {el.stats.count}/{el.stats.total}
                      </Typography>
                    </Box>
                  </Box>
                </Paper>
              );
            })}
          </Box>
        </TrendSection>
      )}

      {/* Patterns */}
      {data.patterns.length > 0 && (
        <TrendSection title="Pattern" subtitle="solid vs print">
          <Box sx={{ display: "flex", gap: 2.5, overflowX: "auto", pb: 1 }}>
            {data.patterns.map((el) => {
              const stage = STAGE_COLORS[el.stats.stage] ?? STAGE_COLORS.emg;
              return (
                <Paper
                  key={el.family}
                  component={Link}
                  to={elementUrl(el)}
                  sx={{
                    flexShrink: 0,
                    width: 180,
                    borderRadius: "12px",
                    overflow: "hidden",
                    border: "1px solid #f0e4e2",
                    textDecoration: "none",
                    transition: "border-color 0.15s, transform 0.15s",
                    "&:hover": { borderColor: "#dfbfbc", transform: "translateY(-2px)" },
                  }}
                >
                  {el.image_url ? (
                    <Box
                      component="img"
                      src={el.image_url}
                      alt={el.family}
                      sx={{ width: "100%", height: 140, objectFit: "cover", display: "block" }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <Box sx={{ height: 140, bgcolor: "#f5f0ef", display: "grid", placeItems: "center" }}>
                      <Typography sx={{ fontFamily: "'Literata', Georgia, serif", fontSize: 28, color: "text.disabled" }}>
                        {el.family === "Solid" ? "—" : "◆"}
                      </Typography>
                    </Box>
                  )}
                  <Box sx={{ p: 1.5 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: "text.primary" }} noWrap>
                      {el.family}
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                      <Box sx={{ px: 0.75, py: 0.25, borderRadius: "4px", bgcolor: stage.bg }}>
                        <Typography sx={{ fontSize: 9, fontWeight: 700, color: stage.fg }}>
                          {stage.label}
                        </Typography>
                      </Box>
                      <Typography sx={{ fontSize: 10, color: "text.disabled" }}>
                        {el.stats.count}/{el.stats.total}
                      </Typography>
                    </Box>
                  </Box>
                </Paper>
              );
            })}
          </Box>
        </TrendSection>
      )}

      {/* Silhouettes */}
      {data.silhouettes.length > 0 && (
        <TrendSection title="The shapes" subtitle="technical flats">
          <Box sx={{ display: "flex", gap: 2, overflowX: "auto", pb: 1 }}>
            {data.silhouettes.map((s, i) => (
              <Paper
                key={i}
                component={Link}
                to={`/app/looks/${s.look_id}/garment/${s.garment_id}`}
                sx={{
                  flexShrink: 0,
                  width: 130,
                  borderRadius: "12px",
                  overflow: "hidden",
                  border: "1px solid #f0e4e2",
                  textDecoration: "none",
                  transition: "border-color 0.15s, transform 0.15s",
                  "&:hover": { borderColor: "#dfbfbc", transform: "translateY(-2px)" },
                }}
              >
                {s.flat_url ? (
                  <Box sx={{ bgcolor: "#f5f0ef", p: 1.5, height: 150, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Box
                      component="img"
                      src={s.flat_url}
                      alt={s.brand}
                      sx={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                    />
                  </Box>
                ) : (
                  <Box sx={{ height: 150, bgcolor: "#f5f0ef" }} />
                )}
                <Box sx={{ p: 1.25 }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 600, color: "text.primary" }} noWrap>
                    {s.brand}
                  </Typography>
                  <Typography sx={{ fontSize: 10, color: "text.secondary" }} noWrap>
                    {s.piece}
                  </Typography>
                </Box>
              </Paper>
            ))}
          </Box>
        </TrendSection>
      )}
    </Box>
  );
}

function TrendSection({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <Box sx={{ mb: 5 }}>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.5, mb: 2 }}>
        <Typography sx={{
          fontFamily: "'Literata', Georgia, serif",
          fontSize: 20,
          fontWeight: 700,
          color: "text.primary",
        }}>
          {title}
        </Typography>
        <Typography sx={{ fontSize: 12, color: "text.disabled" }}>
          {subtitle}
        </Typography>
      </Box>
      {children}
    </Box>
  );
}
