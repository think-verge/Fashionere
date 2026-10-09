/* eslint-disable @typescript-eslint/no-explicit-any */
import { Box, Typography, Button, Skeleton } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api/client";
import { useNavigate } from "react-router-dom";
import { ConceptImage } from "../../components/ConceptImage";

interface MockVariant {
  id: string;
  title: string;
  materials: string;
  isSkeleton?: boolean;
}

export function Stage3Editorial({ workspaceId, ws }: { workspaceId?: string; ws?: any }) {
  const navigate = useNavigate();
  const { data: variants = [], isLoading } = useQuery<MockVariant[]>({
    queryKey: ["workspace", workspaceId, "variants", "stage3"],
    queryFn: async () => {
      const { data } = await api.get("/concepts", { params: { workspace_id: workspaceId } });
      
      if (data && data.length > 0) {
        return data.map((c: any) => ({
          id: c._id,
          title: c.combo?.silhouette_label || "AI Concept",
          materials: `${c.combo?.fabric_label || "Cotton"} • ${c.combo?.color?.name || "Black"}`,
        }));
      }

      const { data: mockData } = await api.get(`/workspace/${workspaceId}/variants?stage=3`);
      return mockData;
    },
    enabled: !!workspaceId,
  });

  const showSkeleton = isLoading || ws?.status === "generating";
  const displayVariants = showSkeleton
    ? Array.from({ length: 6 }).map((_, i) => ({
        id: `skeleton-${i}`,
        title: "",
        materials: "",
        isSkeleton: true,
      }))
    : variants;

  return (
    <Box sx={{ mt: 1, mb: 4, width: "100%" }}>
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
          {showSkeleton ? <Skeleton variant="text" width={100} height={20} /> : <Typography sx={{ fontSize: 12, color: "text.secondary" }}>High-leg maillot</Typography>}
        </Box>
        <Box sx={{ minWidth: 150 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", color: "text.primary", mb: 1, textTransform: "uppercase" }}>SECOND LOOK</Typography>
          {showSkeleton ? <Skeleton variant="text" width={100} height={20} /> : <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Wrap sarong dress</Typography>}
        </Box>
        <Box sx={{ minWidth: 150 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", color: "text.primary", mb: 1, textTransform: "uppercase" }}>FABRIC</Typography>
          {showSkeleton ? <Skeleton variant="text" width={100} height={20} /> : <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Crinkle seersucker</Typography>}
        </Box>
        <Box sx={{ minWidth: 150 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", color: "text.primary", mb: 1, textTransform: "uppercase" }}>COLORWAYS</Typography>
          {showSkeleton ? (
            <Skeleton variant="text" width={150} height={20} />
          ) : (
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
          )}
        </Box>
      </Box>

      {/* 01 The Campaign */}
      <Box sx={{ mb: 6 }}>
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
          <Box sx={{ flex: 1, width: "100%", position: "relative", maxWidth: 500 }}>
            <ConceptImage conceptId={displayVariants[0]?.id || ""} sx={{ height: "auto", aspectRatio: "3/4", borderRadius: "16px", display: "block" }} />
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
      <Box sx={{ mb: 6 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 3 }}>
          <Typography sx={{ fontSize: 18, color: "text.primary", fontFamily: "'Literata', Georgia, serif" }}>
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "Inter, sans-serif", letterSpacing: "0.05em", marginRight: "12px", color: "text.secondary" }}>
              02
            </span>
            Editorial looks
          </Typography>
          <Typography sx={{ fontSize: 12, color: "text.secondary", letterSpacing: "0.05em", textTransform: "uppercase" }}>on-model · in context</Typography>
        </Box>
        
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 3 }}>
          {displayVariants.slice(1, 3).map((v, i) => (
            <Box key={v.id}>
              <Box sx={{ position: "relative" }}>
                <Box sx={{ position: "absolute", top: 12, left: 12, bgcolor: "rgba(0,0,0,0.6)", color: "#fff", px: 1, py: 0.5, borderRadius: "4px", fontSize: 10, fontWeight: 700, zIndex: 1 }}>
                  0{i + 2}
                </Box>
                <ConceptImage conceptId={v.id} sx={{ height: "auto", aspectRatio: "3/4", borderRadius: "16px", display: "block" }} />
              </Box>
            </Box>
          ))}
          {displayVariants.slice(1, 3).length === 1 && <Box />}
          {displayVariants.slice(1, 3).length === 0 && (
            <>
              <Box />
              <Box />
            </>
          )}
        </Box>
      </Box>

      {/* 03 Colorway study */}
      <Box sx={{ mb: 6 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 3 }}>
          <Typography sx={{ fontSize: 18, color: "text.primary", fontFamily: "'Literata', Georgia, serif" }}>
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "Inter, sans-serif", letterSpacing: "0.05em", marginRight: "12px", color: "text.secondary" }}>
              03
            </span>
            Colorway study
          </Typography>
          <Typography sx={{ fontSize: 12, color: "text.secondary", letterSpacing: "0.05em", textTransform: "uppercase" }}>one silhouette · two colors</Typography>
        </Box>
        
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 3 }}>
          <Box>
            <ConceptImage conceptId={displayVariants[0]?.id || ""} sx={{ height: "auto", aspectRatio: "3/4", borderRadius: "16px", display: "block" }} />
            <Box sx={{ mt: 2 }}>
              <Typography sx={{ fontSize: 13, color: "text.primary", mb: 0.5 }}>Maillot — coral bloom</Typography>
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Primary colorway</Typography>
            </Box>
          </Box>
          <Box>
            {(displayVariants[4] || displayVariants[1]) ? (
              <ConceptImage conceptId={(displayVariants[4] || displayVariants[1])!.id} sx={{ height: "auto", aspectRatio: "3/4", borderRadius: "16px", display: "block" }} />
            ) : (
              <Box sx={{ width: "100%", height: "auto", aspectRatio: "3/4" }} />
            )}
            <Box sx={{ mt: 2 }}>
              <Typography sx={{ fontSize: 13, color: "text.primary", mb: 0.5 }}>Maillot — terracotta</Typography>
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Alternate colorway</Typography>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* FOOTER */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 2, pt: 2, borderTop: "1px solid #f0e4e2" }}>
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
