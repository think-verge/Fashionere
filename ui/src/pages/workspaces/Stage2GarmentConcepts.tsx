/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef } from "react";
import { Box, Typography, IconButton, Card, CardMedia, CardContent, Chip } from "@mui/material";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api/client";
import { CircularProgress } from "@mui/material";
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

export function Stage2GarmentConcepts({ workspaceId, ws }: { workspaceId?: string; ws?: any }) {
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

  if (isLoading) {
    return (
      <Box sx={{ p: 4, display: "flex", justifyContent: "center", width: "100%", mt: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  // Extract items for CARRIED FROM STAGE 01
  const palettes = ws?.elements?.filter((e: any) => e.element_type === "color") || [];
  const silhouettes = ws?.elements?.filter((e: any) => e.element_type === "silhouette") || [];
  const patterns = ws?.elements?.filter((e: any) => e.element_type === "pattern") || [];
  const materials = ws?.elements?.filter((e: any) => e.element_type === "fabric") || [];

  const renderColor = (el: any) => {
    const colors = el.data?.colors || [];
    if (colors.length === 0) return null;
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mr: 2 }} key={el.element_id}>
        <Box sx={{ width: 14, height: 14, borderRadius: "50%", bgcolor: colors[0].hex || "#ccc", border: "1px solid rgba(0,0,0,0.1)" }} />
        <Typography sx={{ fontSize: 11, color: "#333" }}>{colors[0].name || "Color"}</Typography>
      </Box>
    );
  };

  const getLabel = (el: any) => {
    if (el.element_type === "silhouette") return "Silhouette";
    if (el.element_type === "pattern") return (el.data as any)?.pattern as string || "Pattern";
    if (el.element_type === "fabric") return ((el.data as any)?.fabric as any)?.name as string || (el.data as any)?.fabric as string || "Fabric";
    return "";
  };

  const sections = [
    { title: "01 Garment concepts", subtitle: "flat-lay · no body", images: variants.slice(0, 4) },
    { title: "02 On the form", subtitle: "ghost mannequin", images: variants.slice(4, 8) },
    { title: "03 Construction details", subtitle: "close-up", images: variants.slice(8, 12) },
  ];

  return (
    <Box sx={{ mt: 1, mb: 4, maxWidth: "1200px" }}>
      {/* HEADER */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 0.5 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary", textTransform: "uppercase" }}>
          CENTOIRE — GARMENT CONCEPTS
        </Typography>
        <Box sx={{ textAlign: "right" }}>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary", textTransform: "uppercase" }}>
            SS26 WOMENSWEAR · BEACHWEAR
          </Typography>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.disabled", textTransform: "uppercase", mt: 0.5 }}>
            STAGE 02 / 03
          </Typography>
        </Box>
      </Box>

      {/* TITLE */}
      <Typography sx={{ fontSize: 44, color: "text.primary", mb: 4, letterSpacing: "-0.02em", fontFamily: "'Literata', Georgia, serif" }}>
        {ws?.name || "Coastal ease"}
      </Typography>

      {/* CARRIED FROM STAGE 01 */}
      <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", mb: 2 }}>
        CARRIED FROM STAGE 01
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 6, mb: 4 }}>
        <Box sx={{ minWidth: 150 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", color: "text.primary", mb: 1, textTransform: "uppercase" }}>PALETTE</Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap" }}>
            {palettes.map(renderColor)}
            {palettes.length === 0 && <Typography sx={{ fontSize: 12, color: "text.disabled" }}>None selected</Typography>}
          </Box>
        </Box>
        <Box sx={{ minWidth: 150 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", color: "text.primary", mb: 1, textTransform: "uppercase" }}>SILHOUETTE</Typography>
          {silhouettes.map((el: any) => (
            <Typography key={el.element_id} sx={{ fontSize: 12, color: "text.secondary", mb: 0.5 }}>{getLabel(el)}</Typography>
          ))}
          {silhouettes.length === 0 && <Typography sx={{ fontSize: 12, color: "text.disabled" }}>None selected</Typography>}
        </Box>
        <Box sx={{ minWidth: 150 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", color: "text.primary", mb: 1, textTransform: "uppercase" }}>PATTERN</Typography>
          {patterns.map((el: any) => (
            <Typography key={el.element_id as string} sx={{ fontSize: 12, color: "text.secondary", mb: 0.5 }}>{getLabel(el)}</Typography>
          ))}
          {patterns.length === 0 && <Typography sx={{ fontSize: 12, color: "text.disabled" }}>None selected</Typography>}
        </Box>
        <Box sx={{ minWidth: 150 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", color: "text.primary", mb: 1, textTransform: "uppercase" }}>MATERIAL</Typography>
          {materials.map((el: any) => (
            <Typography key={el.element_id as string} sx={{ fontSize: 12, color: "text.secondary", mb: 0.5 }}>{getLabel(el)}</Typography>
          ))}
          {materials.length === 0 && <Typography sx={{ fontSize: 12, color: "text.disabled" }}>None selected</Typography>}
        </Box>
      </Box>

      {/* SECTIONS */}
      {sections.map((section, idx) => (
        <SectionCarousel 
          key={idx} 
          section={section} 
          editVariant={editVariant} 
          attachInventory={attachInventory}
        />
      ))}

      {/* FOOTER */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 6, pt: 4, borderTop: "1px solid #f0e4e2" }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary", textTransform: "uppercase" }}>
          STAGE 02 — GARMENT CONCEPTS
        </Typography>
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", cursor: "pointer", "&:hover": { color: "primary.main" } }}>
          NEXT — EDITORIAL, ON-MODEL →
        </Typography>
      </Box>
    </Box>
  );
}

// Carousel Component for each section
function SectionCarousel({ section, editVariant, attachInventory }: { section: any, editVariant: any, attachInventory: any }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const toggleSelect = (id: string) => {
    setSelected(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const scrollLeft = () => {
    if (scrollRef.current) scrollRef.current.scrollBy({ left: -340, behavior: "smooth" });
  };

  const scrollRight = () => {
    if (scrollRef.current) scrollRef.current.scrollBy({ left: 340, behavior: "smooth" });
  };

  if (!section.images || section.images.length === 0) return null;

  return (
    <Box sx={{ mb: 8 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 2 }}>
          <Typography sx={{ fontSize: 20, color: "text.primary", fontFamily: "'Literata', Georgia, serif" }}>
            <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "Inter, sans-serif", letterSpacing: "0.05em", marginRight: "12px", color: "text.secondary" }}>
              {section.title.split(" ")[0]}
            </span>
            {section.title.split(" ").slice(1).join(" ")}
          </Typography>
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{section.subtitle}</Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <IconButton onClick={scrollLeft} size="small" sx={{ border: "1px solid #f0e4e2" }}>
            <ChevronLeftIcon />
          </IconButton>
          <IconButton onClick={scrollRight} size="small" sx={{ border: "1px solid #f0e4e2" }}>
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
          px: 0.5,
          "&::-webkit-scrollbar": { display: "none" },
          msOverflowStyle: "none",
          scrollbarWidth: "none",
        }}
      >
        {(section.images as MockVariant[]).map((img: MockVariant, i: number) => {
          const isSelected = selected[img.id];
          return (
            <Box key={img.id} sx={{ minWidth: 320, flexShrink: 0, width: 320 }}>
              <Card sx={{ 
                position: "relative", 
                borderRadius: "24px", 
                boxShadow: isSelected ? "0 0 0 2px #000" : "0 8px 24px rgba(0,0,0,0.06)", 
                bgcolor: "#fff",
                border: "1px solid #f5f0ef",
                borderBottom: "3px solid #e8dedd",
                overflow: "hidden",
                cursor: "pointer",
                transition: "all 0.2s ease"
              }}
              onClick={() => toggleSelect(img.id)}
              >
                <Box sx={{ position: "relative", aspectRatio: "4/5", overflow: "hidden", bgcolor: "#f5f0ef" }}>
                  <CardMedia
                    component="img"
                    image={img.imageUrl}
                    sx={{ 
                      position: "absolute", top: 0, left: 0,
                      width: "100%", height: "100%", objectFit: "cover",
                      opacity: editVariant.isPending ? 0.5 : 1,
                      transition: "opacity 0.3s"
                    }}
                  />
                  
                  <Chip 
                    label={`0${i + 1}`} 
                    size="small" 
                    sx={{ 
                      position: "absolute", top: 16, left: 16, 
                      bgcolor: "rgba(0,0,0,0.5)", color: "#fff", 
                      borderRadius: "8px", fontSize: 12, fontWeight: 700 
                    }} 
                  />

                  <Box sx={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 1 }}>
                    <IconButton 
                      size="small" 
                      onClick={(e) => { e.stopPropagation(); editVariant.mutate(img.id); }}
                      sx={{ bgcolor: "rgba(255,255,255,0.9)", "&:hover": { bgcolor: "#fff" }, boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}
                      title="Edit Variant"
                    >
                      <EditIcon fontSize="small" sx={{ color: "text.primary" }} />
                    </IconButton>
                    <IconButton 
                      size="small" 
                      onClick={(e) => { e.stopPropagation(); (attachInventory as { mutate: (id: string) => void }).mutate(img.id); }}
                      sx={{ bgcolor: "rgba(255,255,255,0.9)", "&:hover": { bgcolor: "#fff" }, boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}
                      title="Attach Inventory"
                    >
                      <InventoryIcon fontSize="small" sx={{ color: "text.primary" }} />
                    </IconButton>
                  </Box>
                  
                  <Box sx={{ 
                    position: "absolute", bottom: 12, right: 12, 
                    width: 24, height: 24, borderRadius: "50%", 
                    border: isSelected ? "none" : "2px solid rgba(255,255,255,0.8)",
                    bgcolor: isSelected ? "#000" : "rgba(0,0,0,0.2)",
                    display: "flex", alignItems: "center", justifyContent: "center"
                  }}>
                    {isSelected && <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: "#fff" }} />}
                  </Box>
                </Box>
                <CardContent sx={{ px: 2, py: 2.5 }}>
                  <Typography sx={{ fontWeight: 600, fontSize: 14, mb: 0.5, color: "text.primary" }}>{img.title}</Typography>
                  <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{img.materials}</Typography>
                </CardContent>
              </Card>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
