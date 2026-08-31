import { Box, Tooltip } from "@mui/material";

interface Swatch {
  hex: string;
  family?: string;
  name?: string;
}

interface Props {
  swatches: Swatch[];
  size?: number;
}

export function PaletteStrip({ swatches, size = 28 }: Props) {
  return (
    <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
      {swatches.map((s, i) => (
        <Tooltip key={i} title={`${s.hex}${s.family ? ` · ${s.family}` : ""}${s.name ? ` · ${s.name}` : ""}`}>
          <Box
            sx={{
              width: size,
              height: size,
              borderRadius: 1.5,
              bgcolor: s.hex,
              border: "2px solid rgba(255,255,255,0.15)",
              cursor: "pointer",
              flexShrink: 0,
            }}
          />
        </Tooltip>
      ))}
    </Box>
  );
}
