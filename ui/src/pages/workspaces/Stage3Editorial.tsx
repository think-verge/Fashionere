/* eslint-disable @typescript-eslint/no-explicit-any */
import { Box, Typography, Button } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api/client";
import { CircularProgress } from "@mui/material";
import { useNavigate } from "react-router-dom";

interface MockVariant {
  id: string;
  imageUrl: string;
  title: string;
  materials: string;
}

export function Stage3Editorial({ workspaceId, ws }: { workspaceId?: string; ws?: any }) {
  const navigate = useNavigate();
  const { data: variants = [], isLoading } = useQuery<MockVariant[]>({
    queryKey: ["workspace", workspaceId, "variants", "stage3"],
    queryFn: async () => {
      const { data } = await api.get(`/workspace/${workspaceId}/variants?stage=3`);
      return data;
    },
    enabled: !!workspaceId,
  });

  if (isLoading) {
    return (
      <Box sx={{ p: 4, display: "flex", justifyContent: "center", width: "100%", mt: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 1, mb: 4, maxWidth: "1200px" }}>
      {/* HEADER */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 0.5 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary", textTransform: "uppercase" }}>
          CENTOIRE — EDITORIAL
        </Typography>
        <Box sx={{ textAlign: "right" }}>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary", textTransform: "uppercase" }}>
            SS26 WOMENSWEAR · BEACHWEAR
          </Typography>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.disabled", textTransform: "uppercase", mt: 0.5 }}>
            STAGE 03 / 03
          </Typography>
        </Box>
      </Box>

      {/* TITLE */}
      <Typography sx={{ fontSize: 44, color: "text.primary", mb: 4, letterSpacing: "-0.02em", fontFamily: "'Literata', Georgia, serif" }}>
        {ws?.name as string || "Coastal ease"}
      </Typography>

      {/* CARRIED FROM STAGE 02 */}
      <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", mb: 2 }}>
        CARRIED FROM STAGE 02
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 6, mb: 8 }}>
        <Box sx={{ minWidth: 150 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", color: "text.primary", mb: 1, textTransform: "uppercase" }}>HERO GARMENT</Typography>
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>High-leg maillot</Typography>
        </Box>
        <Box sx={{ minWidth: 150 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", color: "text.primary", mb: 1, textTransform: "uppercase" }}>SECOND LOOK</Typography>
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Wrap sarong dress</Typography>
        </Box>
        <Box sx={{ minWidth: 150 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", color: "text.primary", mb: 1, textTransform: "uppercase" }}>FABRIC</Typography>
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Crinkle seersucker</Typography>
        </Box>
        <Box sx={{ minWidth: 150 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", color: "text.primary", mb: 1, textTransform: "uppercase" }}>COLORWAYS</Typography>
          <Box sx={{ display: "flex", gap: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Box sx={{ width: 14, height: 14, borderRadius: "50%", bgcolor: "#E28B78", border: "1px solid rgba(0,0,0,0.1)" }} />
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Coral bloom</Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Box sx={{ width: 14, height: 14, borderRadius: "50%", bgcolor: "#C26D4D", border: "1px solid rgba(0,0,0,0.1)" }} />
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Terracotta</Typography>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* 01 The Campaign */}
      <Box sx={{ mb: 10 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 3 }}>
          <Typography sx={{ fontSize: 18, color: "text.primary", fontFamily: "'Literata', Georgia, serif" }}>
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "Inter, sans-serif", letterSpacing: "0.05em", marginRight: "12px", color: "text.secondary" }}>
              01
            </span>
            The campaign
          </Typography>
          <Typography sx={{ fontSize: 12, color: "text.secondary", letterSpacing: "0.05em", textTransform: "uppercase" }}>hero look</Typography>
        </Box>
        
        <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 4, alignItems: "center" }}>
          <Box sx={{ flex: 1, width: "100%" }}>
             <img src={variants[0]?.imageUrl} style={{ width: "100%", height: "auto", aspectRatio: "3/4", objectFit: "cover", display: "block", borderRadius: "16px" }} alt="Campaign look" />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", color: "text.secondary", textTransform: "uppercase", mb: 2 }}>
              LOOK 01 — THE MAILLOT
            </Typography>
            <Typography sx={{ fontSize: 32, fontFamily: "Inter, sans-serif", fontWeight: 400, color: "text.primary", lineHeight: 1.2, mb: 3 }}>
              Coral, salt-worn,<br/>caught in the afternoon.
            </Typography>
            <Typography sx={{ fontSize: 14, color: "text.secondary", lineHeight: 1.6, maxWidth: 400 }}>
              The high-leg maillot in coral crinkle seersucker, shot against a sun-warmed terracotta wall. The palette and mood resolve exactly to the Stage 01 direction — no styling drift.
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* 02 Editorial looks */}
      <Box sx={{ mb: 10 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 3 }}>
          <Typography sx={{ fontSize: 18, color: "text.primary", fontFamily: "'Literata', Georgia, serif" }}>
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "Inter, sans-serif", letterSpacing: "0.05em", marginRight: "12px", color: "text.secondary" }}>
              02
            </span>
            Editorial looks
          </Typography>
          <Typography sx={{ fontSize: 12, color: "text.secondary", letterSpacing: "0.05em", textTransform: "uppercase" }}>on-model · in context</Typography>
        </Box>
        
        <Box sx={{ display: "flex", gap: 3 }}>
          {variants.slice(1, 3).map((v, i) => (
            <Box key={v.id} sx={{ flex: 1 }}>
              <Box sx={{ position: "relative" }}>
                <Box sx={{ position: "absolute", top: 12, left: 12, bgcolor: "rgba(0,0,0,0.6)", color: "#fff", px: 1, py: 0.5, borderRadius: "4px", fontSize: 10, fontWeight: 700 }}>
                  0{i + 2}
                </Box>
                <img src={v.imageUrl} style={{ width: "100%", height: "auto", aspectRatio: "3/4", objectFit: "cover", borderRadius: "16px", display: "block" }} alt={v.title} />
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      {/* 03 Colorway study */}
      <Box sx={{ mb: 10 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 3 }}>
          <Typography sx={{ fontSize: 18, color: "text.primary", fontFamily: "'Literata', Georgia, serif" }}>
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "Inter, sans-serif", letterSpacing: "0.05em", marginRight: "12px", color: "text.secondary" }}>
              03
            </span>
            Colorway study
          </Typography>
          <Typography sx={{ fontSize: 12, color: "text.secondary", letterSpacing: "0.05em", textTransform: "uppercase" }}>one silhouette · two colors</Typography>
        </Box>
        
        <Box sx={{ display: "flex", gap: 3 }}>
          <Box sx={{ flex: 1 }}>
            <img src={variants[0]?.imageUrl} style={{ width: "100%", height: "auto", aspectRatio: "3/4", objectFit: "cover", display: "block", borderRadius: "16px" }} alt="Colorway 1" />
            <Box sx={{ mt: 2 }}>
              <Typography sx={{ fontSize: 13, color: "text.primary", mb: 0.5 }}>Maillot — coral bloom</Typography>
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Primary colorway</Typography>
            </Box>
          </Box>
          <Box sx={{ flex: 1 }}>
            <img src={variants[4]?.imageUrl || variants[1]?.imageUrl} style={{ width: "100%", height: "auto", aspectRatio: "3/4", objectFit: "cover", display: "block", borderRadius: "16px" }} alt="Colorway 2" />
            <Box sx={{ mt: 2 }}>
              <Typography sx={{ fontSize: 13, color: "text.primary", mb: 0.5 }}>Maillot — terracotta</Typography>
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Alternate colorway</Typography>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* FOOTER */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 6, pt: 4, borderTop: "1px solid #f0e4e2" }}>
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
