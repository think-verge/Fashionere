import { Box, Chip, Paper, Typography } from "@mui/material";
import { PaletteStrip } from "./PaletteStrip";
import type { Garment } from "../lib/api/generated/model";

interface Tile {
  url: string;
  label: string;
  kind: "fabric" | "pattern";
}

function TileGrid({ tiles }: { tiles: Tile[] }) {
  if (tiles.length === 0) return null;
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 1.5 }}>
      {tiles.map((tile, i) => (
        <Box key={i} sx={{ position: "relative" }}>
          <Box
            component="img"
            src={tile.url}
            alt={tile.label}
            sx={{ width: "100%", borderRadius: 2, aspectRatio: "1", objectFit: "cover", display: "block" }}
          />
          <Chip
            label={tile.kind}
            size="small"
            sx={{ position: "absolute", bottom: 6, left: 6, fontSize: 10, height: 18, bgcolor: "rgba(0,0,0,0.7)", color: "#fff" }}
          />
          <Typography variant="caption" sx={{ display: "block", mt: 0.5, color: "text.secondary" }} noWrap>
            {tile.label}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

interface Props {
  garment: Garment;
}

export function GarmentBreakdown({ garment }: Props) {
  const palette = garment.colors
    .filter((c) => c.hex)
    .map((c) => ({ hex: c.hex as string, family: c.name, role: c.role }));

  const fabricTiles: Tile[] = garment.fabrics
    .filter((f) => f.swatch_url)
    .map((f) => ({ url: f.swatch_url as string, label: f.name ?? f.material ?? "Fabric", kind: "fabric" }));

  const patternTiles: Tile[] = garment.patterns
    .filter((p) => p.swatch_url)
    .map((p) => ({ url: p.swatch_url as string, label: p.name ?? p.motif ?? "Pattern", kind: "pattern" }));

  return (
    <Paper sx={{ p: 2.5 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          {garment.piece ?? garment.garment_id ?? "Garment"}
        </Typography>
        {garment.flat && (
          <Box
            component="img"
            src={garment.flat}
            alt={`${garment.piece ?? "garment"} flat`}
            sx={{ width: 72, height: 72, borderRadius: 1.5, objectFit: "contain", bgcolor: "#fff", border: "1px solid", borderColor: "divider" }}
          />
        )}
      </Box>

      {palette.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
            Color Palette
          </Typography>
          <PaletteStrip swatches={palette} size={36} />
        </Box>
      )}

      {fabricTiles.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
            Fabrics
          </Typography>
          <TileGrid tiles={fabricTiles} />
        </Box>
      )}

      {patternTiles.length > 0 && (
        <Box>
          <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
            Patterns
          </Typography>
          <TileGrid tiles={patternTiles} />
        </Box>
      )}
    </Paper>
  );
}
