import { Box, Typography } from "@mui/material";

interface Props {
  eyebrow: string;
  heading: string;
  description?: string;
}

export function PageHeader({ eyebrow, heading, description }: Props) {
  return (
    <Box sx={{ mb: 6 }}>
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
        {eyebrow}
      </Typography>
      <Typography
        sx={{
          fontSize: { xs: 32, md: 48 },
          fontWeight: 700,
          letterSpacing: "-0.02em",
          lineHeight: 1.1,
          mb: description ? 2.5 : 0,
          color: "text.primary",
        }}
      >
        {heading}
      </Typography>
      {description && (
        <Typography
          sx={{
            fontFamily: "'Literata', Georgia, serif",
            fontSize: 17,
            lineHeight: 1.7,
            color: "text.secondary",
            maxWidth: 560,
          }}
        >
          {description}
        </Typography>
      )}
    </Box>
  );
}
