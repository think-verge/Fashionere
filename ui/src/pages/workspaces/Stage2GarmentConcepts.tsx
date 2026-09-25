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

const MOCK_VARIANTS: MockVariant[] = [
  { id: "1", imageUrl: "https://images.unsplash.com/photo-1621344212727-b3711317ba01?auto=format&fit=crop&q=80&w=600", title: "High-leg maillot", materials: "Coral · crinkle seersucker" },
  { id: "2", imageUrl: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?auto=format&fit=crop&q=80&w=600", title: "Wrap sarong dress", materials: "Bleached sand · tropical botanical" },
  { id: "3", imageUrl: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&q=80&w=600", title: "Pleated midi skirt", materials: "Terracotta · washed linen" },
  { id: "4", imageUrl: "https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&q=80&w=600", title: "Knit halter top", materials: "Coral bloom · ribbed knit" },
  { id: "5", imageUrl: "https://images.unsplash.com/photo-1618244972963-dbee1a7edc95?auto=format&fit=crop&q=80&w=600", title: "Wide leg trouser", materials: "Bleached sand · linen" },
  { id: "6", imageUrl: "https://images.unsplash.com/photo-1551163943-3f6a855d1153?auto=format&fit=crop&q=80&w=600", title: "Bikini top", materials: "Terracotta · crinkle" },
  { id: "7", imageUrl: "https://images.unsplash.com/photo-1603681428059-45914620023a?auto=format&fit=crop&q=80&w=600", title: "Cover-up tunic", materials: "Coral bloom · cotton silk" },
  { id: "8", imageUrl: "https://images.unsplash.com/photo-1550639525-c97d455acf70?auto=format&fit=crop&q=80&w=600", title: "Maxi slip dress", materials: "Bleached sand · silk satin" },
];

export function Stage2GarmentConcepts() {
  const scrollRef = useRef<HTMLDivElement>(null);

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
        {MOCK_VARIANTS.map((variant, index) => (
          <Box key={variant.id} sx={{ minWidth: 400, flexShrink: 0 }}>
            <Card sx={{ position: "relative", borderRadius: 0, boxShadow: "none", bgcolor: "transparent" }}>
              <Box sx={{ position: "relative", aspectRatio: "4/5", overflow: "hidden", bgcolor: "#f5f0ef" }}>
                <CardMedia
                  component="img"
                  image={variant.imageUrl}
                  sx={{ width: "100%", height: "100%", objectFit: "cover" }}
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
                    sx={{ bgcolor: "rgba(255,255,255,0.8)", "&:hover": { bgcolor: "#fff" } }}
                    title="Attach Inventory"
                  >
                    <InventoryIcon fontSize="small" />
                  </IconButton>
                  <IconButton 
                    size="small" 
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
