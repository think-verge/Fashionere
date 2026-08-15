import { Chip, type ChipProps } from "@mui/material";

// Covers both the old per-item "lifecycle_stage" vocabulary and the Trend
// Analysis Engine's per-value momentum "kind".
const LIFECYCLE_COLORS: Record<string, ChipProps["color"]> = {
  emerging: "success",
  rising: "info",
  peaking: "warning",
  steady: "default",
  fading: "warning",
  dropped: "error",
};

const ARROWS: Record<string, string> = {
  emerging: "✦",
  rising: "▲",
  steady: "→",
  fading: "▼",
  dropped: "✕",
};

interface Props {
  lifecycle: string;
  label?: string;
}

export function TrendBadge({ lifecycle, label }: Props) {
  const arrow = ARROWS[lifecycle];
  return (
    <Chip
      label={arrow ? `${arrow} ${label ?? lifecycle}` : label ?? lifecycle}
      color={LIFECYCLE_COLORS[lifecycle] ?? "default"}
      size="small"
      variant="outlined"
    />
  );
}
