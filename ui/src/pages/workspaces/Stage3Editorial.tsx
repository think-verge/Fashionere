/* eslint-disable @typescript-eslint/no-explicit-any */
import { Box, Typography, Button } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { ModelShootSection } from "./ModelShootSection";

export function Stage3Editorial({ workspaceId, ws }: { workspaceId?: string; ws?: any }) {
  const navigate = useNavigate();

  return (
    <Box sx={{ mt: 1, mb: 4, width: "100%" }}>
      {/* HEADER */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 0.5 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary", textTransform: "uppercase" }}>
          CENTOIRE — EDITORIAL
        </Typography>
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.disabled", textTransform: "uppercase" }}>
          STAGE 03 / 03
        </Typography>
      </Box>

      {/* TITLE */}
      <Typography sx={{ fontSize: 44, color: "text.primary", mb: 1, letterSpacing: "-0.02em", fontFamily: "'Literata', Georgia, serif" }}>
        {(ws?.name as string) || "Editorial"}
      </Typography>
      <Typography sx={{ fontSize: 14, color: "text.secondary", mb: 5, maxWidth: 560 }}>
        One garment at a time, on a model in the studio. Set up the model, perfect the main image, let the art director build the shots, then create the garment's own editorial.
      </Typography>

      <ModelShootSection workspaceId={workspaceId} workspaceName={(ws?.name as string) || "Editorial"} />

      {/* FOOTER */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 4, pt: 2, borderTop: "1px solid #f0e4e2" }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary", textTransform: "uppercase" }}>
          STAGE 03 — EDITORIAL
        </Typography>
        <Button
          onClick={() => navigate("/app/workspaces")}
          sx={{ fontSize: 12, fontWeight: 600, color: "primary.main", textTransform: "uppercase", "&:hover": { bgcolor: "transparent", color: "primary.dark" } }}
        >
          COLLECTION DIRECTION COMPLETE ✓
        </Button>
      </Box>
    </Box>
  );
}
