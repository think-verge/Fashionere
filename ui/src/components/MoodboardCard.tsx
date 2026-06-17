import { useNavigate } from "react-router-dom";
import { Card, CardActionArea, CardContent, Typography, Box, Chip } from "@mui/material";
import type { MoodboardSummary } from "../lib/api/generated/model";

const MODE_LABELS: Record<string, string> = {
  query: "Text",
  catalogue: "Catalogue",
  image: "Image",
};

interface Props {
  moodboard: MoodboardSummary;
}

export function MoodboardCard({ moodboard }: Props) {
  const navigate = useNavigate();
  const date = new Date(moodboard.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Card>
      <CardActionArea onClick={() => navigate(`/moodboards/${moodboard._id}`)}>
        <Box
          sx={{
            height: 140,
            bgcolor: "rgba(201,168,76,0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Typography variant="h2" sx={{ opacity: 0.15 }}>
            ✦
          </Typography>
        </Box>
        <CardContent sx={{ pb: "12px !important" }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 0.5 }}>
            <Typography variant="body2" fontWeight={600} noWrap sx={{ flex: 1, mr: 1 }}>
              {moodboard.name || "Untitled"}
            </Typography>
            <Chip
              label={moodboard.status}
              size="small"
              color={moodboard.status === "done" ? "success" : moodboard.status === "error" ? "error" : "default"}
              sx={{ fontSize: 10, height: 20 }}
            />
          </Box>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <Chip
              label={MODE_LABELS[moodboard.inputMode] ?? moodboard.inputMode}
              size="small"
              variant="outlined"
              sx={{ fontSize: 10, height: 18 }}
            />
            <Typography variant="caption" color="text.secondary">
              {date}
            </Typography>
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
