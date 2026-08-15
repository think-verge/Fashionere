import { Box, Chip, Paper, SvgIcon, Typography } from "@mui/material";

interface Props {
  title: string;
  description: string;
  Icon: typeof SvgIcon;
  enabled: boolean;
  selected: boolean;
  onClick: () => void;
}

export function FlowSelectorCard({ title, description, Icon, enabled, selected, onClick }: Props) {
  return (
    <Paper
      onClick={enabled ? onClick : undefined}
      sx={{
        p: 2.5,
        position: "relative",
        cursor: enabled ? "pointer" : "not-allowed",
        opacity: enabled ? 1 : 0.55,
        borderColor: selected ? "primary.main" : undefined,
        bgcolor: selected ? "#fff0ef" : undefined,
        transition: "border-color 0.2s, background-color 0.2s",
        "&:hover": enabled ? { borderColor: "primary.main" } : undefined,
      }}
    >
      {!enabled && (
        <Chip
          label="Coming soon"
          size="small"
          variant="outlined"
          sx={{ position: "absolute", top: 12, right: 12, fontSize: 10, height: 20 }}
        />
      )}
      <Box
        sx={{
          width: 40, height: 40, borderRadius: "10px", bgcolor: "#fff0ef",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "primary.main", mb: 1.5,
        }}
      >
        <Icon fontSize="small" />
      </Box>
      <Typography sx={{ fontWeight: 700, mb: 0.5 }}>{title}</Typography>
      <Typography sx={{ fontSize: 13, color: "text.secondary", lineHeight: 1.5 }}>{description}</Typography>
    </Paper>
  );
}
