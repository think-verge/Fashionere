import { useState, useRef } from "react";
import { Box, Typography, IconButton, Card, CardMedia, CardContent, Chip } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import InventoryIcon from "@mui/icons-material/Inventory";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

interface MockVariant {
  id: string;
  imageUrl: string;
  title: string;
  materials: string;
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api/client";
import { CircularProgress } from "@mui/material";

export function Stage2GarmentConcepts({ workspaceId }: { workspaceId?: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data: variants = [], isLoading } = useQuery<MockVariant[]>({
    queryKey: ["workspace", workspaceId, "variants"],
    queryFn: async () => {
      const { data } = await api.get(`/workspace/${workspaceId}/variants`);
      return data;
    },
    enabled: !!workspaceId,
  });

  const editVariant = useMutation({
    mutationFn: async (variantId: string) => {
      const { data } = await api.post(`/workspace/${workspaceId}/variants/${variantId}/edit`, { instructions: "Make it more vibrant" });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspace", workspaceId, "variants"] }),
  });

  const attachInventory = useMutation({
    mutationFn: async (variantId: string) => {
      const { data } = await api.post(`/workspace/${workspaceId}/variants/${variantId}/inventory`, { inventoryIds: ["inv-123"] });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspace", workspaceId, "variants"] }),
  });

  const scrollLeft = () => {
    if (scrollRef.current) scrollRef.current.scrollBy({ left: -400, behavior: "smooth" });
  };

  const scrollRight = () => {
    if (scrollRef.current) scrollRef.current.scrollBy({ left: 400, behavior: "smooth" });
  };

  return (
    <Box sx={{ mt: 8, mb: 4 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.05em" }}>01</Typography>
          <Typography sx={{ fontSize: 20, color: "text.primary", fontFamily: "'Literata', Georgia, serif" }}>
            Garment concepts
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <IconButton onClick={scrollLeft} size="small" sx={{ border: "1px solid #e8dedd" }}>
            <ChevronLeftIcon />
          </IconButton>
          <IconButton onClick={scrollRight} size="small" sx={{ border: "1px solid #e8dedd" }}>
            <ChevronRightIcon />
          </IconButton>
        </Box>
      </Box>

      <Box
        ref={scrollRef}
        sx={{
          display: "flex",
          gap: 3,
          overflowX: "auto",
          pb: 2,
          "&::-webkit-scrollbar": { display: "none" },
          msOverflowStyle: "none",
          scrollbarWidth: "none",
        }}
      >
        {isLoading && (
          <Box sx={{ p: 4, display: "flex", justifyContent: "center", width: "100%" }}>
            <CircularProgress />
          </Box>
        )}
        {!isLoading && variants.map((variant, index) => (
          <Box key={variant.id} sx={{ minWidth: 400, flexShrink: 0 }}>
            <Card sx={{ position: "relative", borderRadius: 0, boxShadow: "none", bgcolor: "transparent" }}>
              <Box sx={{ position: "relative", aspectRatio: "4/5", overflow: "hidden", bgcolor: "#f5f0ef" }}>
                <CardMedia
                  component="img"
                  image={variant.imageUrl}
                  sx={{ 
                    width: "100%", height: "100%", objectFit: "cover",
                    opacity: editVariant.isPending || attachInventory.isPending ? 0.5 : 1,
                    transition: "opacity 0.3s"
                  }}
                />
                
                <Chip 
                  label={`0${index + 1}`} 
                  size="small" 
                  sx={{ 
                    position: "absolute", top: 16, left: 16, 
                    bgcolor: "rgba(0,0,0,0.4)", color: "#fff", 
                    borderRadius: "4px", fontSize: 11, fontWeight: 700 
                  }} 
                />

                <Box sx={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 1 }}>
                  <IconButton 
                    size="small" 
                    onClick={() => attachInventory.mutate(variant.id)}
                    sx={{ bgcolor: "rgba(255,255,255,0.8)", "&:hover": { bgcolor: "#fff" } }}
                    title="Attach Inventory"
                  >
                    <InventoryIcon fontSize="small" />
                  </IconButton>
                  <IconButton 
                    size="small" 
                    onClick={() => editVariant.mutate(variant.id)}
                    sx={{ bgcolor: "rgba(255,255,255,0.8)", "&:hover": { bgcolor: "#fff" } }}
                    title="Edit Variant"
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
              <CardContent sx={{ px: 0, py: 2 }}>
                <Typography sx={{ fontWeight: 600, fontSize: 14, mb: 0.5 }}>{variant.title}</Typography>
                <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{variant.materials}</Typography>
              </CardContent>
            </Card>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
