import { Box, Typography } from "@mui/material";
import { PipelineAnimation } from "./PipelineAnimation";

const FEATURES = [
  {
    label: "Trend Intelligence",
    desc: "Real-time signals from runway, retail & social",
    color: "#ff746d",
  },
  {
    label: "Mood Board Creator",
    desc: "AI-generated visual concepts from a brief",
    color: "#e8d9c5",
  },
  {
    label: "Cost Calculator",
    desc: "Production estimates by category & market tier",
    color: "#a8d5b5",
  },
];

interface Props {
  variant?: "login" | "signup";
}

export function AuthIllustration(_props: Props) {
  return (
    <Box
      sx={{
        flex: 1,
        bgcolor: "#a93533",
        backgroundImage: "linear-gradient(145deg, #a93533 0%, #7d1f1d 60%, #4a1010 100%)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        px: 6,
        py: 8,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Decorative circles */}
      <Box sx={{ position: "absolute", top: -120, right: -120, width: 400, height: 400, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.08)" }} />
      <Box sx={{ position: "absolute", bottom: -80, left: -80, width: 280, height: 280, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.06)" }} />
      <Box sx={{ position: "absolute", top: "30%", right: -60, width: 180, height: 180, borderRadius: "50%", bgcolor: "rgba(255,255,255,0.04)", filter: "blur(40px)" }} />

      {/* Content */}
      <Box sx={{ position: "relative", maxWidth: 440 }}>
        {/* Eyebrow */}
        <Typography sx={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", mb: 2 }}>
          Fashion Intelligence
        </Typography>

        {/* Heading */}
        <Typography
          sx={{
            fontFamily: "'Literata', Georgia, serif",
            fontSize: { xs: 28, lg: 36 },
            fontWeight: 700,
            color: "#ffffff",
            lineHeight: 1.2,
            mb: 2,
            whiteSpace: "pre-line",
          }}
        >
          {"Design Faster\nWith AI"}
        </Typography>

        <Typography sx={{ fontFamily: "'Literata', Georgia, serif", fontSize: 15, color: "rgba(255,255,255,0.65)", lineHeight: 1.7, mb: 4 }}>
          The end-to-end fashion intelligence platform trusted by designers to move from inspiration to production.
        </Typography>

        {/* Interactive pipeline animation */}
        <Box sx={{ mb: 4 }}>
          <PipelineAnimation />
        </Box>

        {/* Feature pills */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {FEATURES.map((f) => (
            <Box
              key={f.label}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                px: 2.5,
                py: 1.5,
                borderRadius: "12px",
                bgcolor: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: f.color, flexShrink: 0 }} />
              <Box>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#ffffff", lineHeight: 1 }}>{f.label}</Typography>
                <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.5)", mt: 0.25 }}>{f.desc}</Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
