import { Chip, type ChipProps } from "@mui/material";

const LIFECYCLE_COLORS: Record<string, ChipProps["color"]> = {
  emerging: "success",
  rising: "info",
  peaking: "warning",
  fading: "default",
};

interface Props {
  lifecycle: string;
  label?: string;
}

export function TrendBadge({ lifecycle, label }: Props) {
  return (
    <Chip
      label={label ?? lifecycle}
      color={LIFECYCLE_COLORS[lifecycle] ?? "default"}
      size="small"
      variant="outlined"
    />
  );
}
