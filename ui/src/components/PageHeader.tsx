import { Box, Typography } from "@mui/material";

interface Props {
  eyebrow: string;
  heading: string;
  description?: string;
}

export function PageHeader({ eyebrow, heading, description }: Props) {
  return (
    <Box sx={{ mb: 4 }}>
      <Typography
        sx={{
          color: "#b94a48",
          fontSize: 12,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          mb: 1.5,
        }}
      >
        {eyebrow}
      </Typography>
      <Typography
        sx={{
          fontFamily: "'Literata', Georgia, serif",
          fontSize: { xs: 36, md: 52 },
          fontWeight: 400,
          letterSpacing: "-0.01em",
          lineHeight: 1.1,
          mb: description ? 2 : 0,
          color: "#0a192f",
        }}
      >
        {heading}
      </Typography>
      {description && (
        <Typography
          sx={{
            fontSize: 16,
            lineHeight: 1.5,
            color: "text.secondary",
            maxWidth: 800,
          }}
        >
          {description}
        </Typography>
      )}
      <Box sx={{ borderBottom: "1px solid rgba(0,0,0,0.06)", mt: 3 }} />
    </Box>
  );
}
