import { useNavigate } from "react-router-dom";
import { Box, Grid, Typography, Paper } from "@mui/material";
import FolderOpenIcon from "@mui/icons-material/FolderOpenOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import StraightenOutlinedIcon from "@mui/icons-material/StraightenOutlined";
import TrendingUpOutlinedIcon from "@mui/icons-material/TrendingUpOutlined";
import PaletteOutlinedIcon from "@mui/icons-material/PaletteOutlined";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { PageShell } from "../../components/PageShell";
import { useAuth } from "../../lib/auth-context";

const stats = [
  { label: "Active Projects", value: "12", Icon: FolderOpenIcon },
  { label: "Deconstructed Looks", value: "34", Icon: DashboardOutlinedIcon },
  { label: "Trend Analyses", value: "08", Icon: BarChartOutlinedIcon },
];

const templates = [
  {
    id: "luxury",
    title: "Luxury Minimalist",
    description: "Premium aesthetic with refined silhouettes and considered restraint.",
    colors: ["#a93533", "#241918", "#e8d9c5"],
    category: "Luxury Resortwear",
  },
  {
    id: "streetwear",
    title: "Urban Edge",
    description: "Bold graphics and technical construction for the street.",
    colors: ["#241918", "#ff746d", "#9a9a9a"],
    category: "Streetwear",
  },
  {
    id: "sustainable",
    title: "Eco-Conscious",
    description: "Sustainable materials paired with soft organic forms.",
    colors: ["#006c4d", "#c9b89a", "#3a3632"],
    category: "Sustainable Basics",
  },
  {
    id: "trend",
    title: "Trend Forward",
    description: "Commercial viability balanced with speed-to-market.",
    colors: ["#ff746d", "#241918", "#f0c14b"],
    category: "Fast Fashion",
  },
];

const capabilities = [
  { Icon: LightbulbOutlinedIcon, title: "Deconstruction Engine", desc: "Break down runway looks into color, fabric, and pattern." },
  { Icon: StraightenOutlinedIcon, title: "TechPacks", desc: "Auto-generate production-ready specifications." },
  { Icon: TrendingUpOutlinedIcon, title: "Trend Analysis", desc: "Real-time market and runway intelligence." },
  { Icon: PaletteOutlinedIcon, title: "Design Sketches", desc: "Generated technical flats per garment, ready to reference." },
];

export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const firstName = user?.name?.split(" ")[0] ?? "Designer";

  return (
    <PageShell title="Dashboard">
      {/* Header */}
      <Box sx={{ mb: 7 }}>
        <Typography
          sx={{
            color: "primary.main",
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.2em",
            mb: 2,
          }}
        >
          Welcome back, {firstName}
        </Typography>
        <Typography
          sx={{
            fontSize: { xs: 36, md: 52 },
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
            mb: 2.5,
            maxWidth: 600,
            color: "text.primary",
          }}
        >
          Your Creative Studio
        </Typography>
        <Typography
          sx={{
            fontFamily: "'Literata', Georgia, serif",
            fontSize: 18,
            lineHeight: 1.7,
            color: "text.secondary",
            maxWidth: 560,
          }}
        >
          Select a template to explore deconstructed looks, trend analysis, and cost
          calculations calibrated to your craft.
        </Typography>
      </Box>

      {/* Stats */}
      <Grid container spacing={2.5} sx={{ mb: 8 }}>
        {stats.map(({ label, value, Icon }) => (
          <Grid key={label} size={{ xs: 12, md: 4 }}>
            <Paper
              sx={{
                p: 3.5,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                transition: "border-color 0.2s",
                "&:hover": { borderColor: "#ff746d" },
              }}
            >
              <Box>
                <Typography
                  sx={{
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.15em",
                    color: "text.disabled",
                    mb: 1.5,
                  }}
                >
                  {label}
                </Typography>
                <Typography
                  sx={{
                    fontSize: 44,
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                    lineHeight: 1,
                    color: "text.primary",
                  }}
                >
                  {value}
                </Typography>
              </Box>
              <Box
                sx={{
                  width: 56,
                  height: 56,
                  borderRadius: "16px",
                  bgcolor: "#fff0ef",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "primary.main",
                }}
              >
                <Icon />
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* Templates */}
      <Box sx={{ mb: 8 }}>
        <Box sx={{ mb: 3.5 }}>
          <Typography
            sx={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.01em", color: "text.primary" }}
          >
            Pre-Built Templates
          </Typography>
          <Typography
            sx={{
              fontFamily: "'Literata', Georgia, serif",
              color: "text.secondary",
              mt: 1,
            }}
          >
            Choose a starting point that aligns with your creative vision.
          </Typography>
        </Box>

        <Grid container spacing={2.5}>
          {templates.map((tmpl) => (
            <Grid key={tmpl.id} size={{ xs: 12, md: 6 }}>
              <Paper
                onClick={() => navigate("/looks")}
                sx={{
                  p: 3.5,
                  cursor: "pointer",
                  transition: "all 0.3s",
                  "&:hover": {
                    borderColor: "#ff746d",
                    boxShadow: "0 8px 30px -12px rgba(169,53,51,0.2)",
                    "& .arrow": { opacity: 1, transform: "translateX(0)" },
                    "& .title": { color: "primary.main" },
                  },
                }}
              >
                <Box sx={{ display: "flex", gap: 1.5, mb: 3 }}>
                  {tmpl.colors.map((color, i) => (
                    <Box
                      key={i}
                      sx={{
                        width: 44,
                        height: 44,
                        borderRadius: "10px",
                        bgcolor: color,
                        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)",
                      }}
                    />
                  ))}
                </Box>
                <Typography
                  className="title"
                  sx={{ fontSize: 18, fontWeight: 700, mb: 1, transition: "color 0.2s", color: "text.primary" }}
                >
                  {tmpl.title}
                </Typography>
                <Typography
                  sx={{
                    fontFamily: "'Literata', Georgia, serif",
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: "text.secondary",
                    mb: 3,
                  }}
                >
                  {tmpl.description}
                </Typography>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    pt: 2.5,
                    borderTop: "1px solid #f0e4e2",
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 10,
                      color: "text.disabled",
                      textTransform: "uppercase",
                      letterSpacing: "0.15em",
                      fontWeight: 600,
                    }}
                  >
                    {tmpl.category}
                  </Typography>
                  <ArrowForwardIcon
                    className="arrow"
                    sx={{
                      fontSize: 16,
                      color: "primary.main",
                      opacity: 0,
                      transform: "translateX(-6px)",
                      transition: "all 0.2s",
                    }}
                  />
                </Box>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Box>

      {/* Capabilities */}
      <Paper sx={{ p: 5, bgcolor: "#fff0ef !important", border: "1px solid #f0e4e2" }}>
        <Typography
          sx={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em", mb: 4, color: "text.primary" }}
        >
          Platform Capabilities
        </Typography>
        <Grid container spacing={4}>
          {capabilities.map(({ Icon, title, desc }) => (
            <Grid key={title} size={{ xs: 12, sm: 6, lg: 3 }}>
              <Box>
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: "16px",
                    bgcolor: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "primary.main",
                    mb: 1.5,
                    border: "1px solid #f0e4e2",
                  }}
                >
                  <Icon />
                </Box>
                <Typography sx={{ fontWeight: 700, mb: 0.75, color: "text.primary" }}>
                  {title}
                </Typography>
                <Typography
                  sx={{
                    fontFamily: "'Literata', Georgia, serif",
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: "text.secondary",
                  }}
                >
                  {desc}
                </Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Paper>
    </PageShell>
  );
}
