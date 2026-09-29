/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useEffect } from "react";
import { Box, Typography, IconButton, Card, CardMedia, CardContent, Chip, Skeleton, TextField, Select, MenuItem, Button, Popover } from "@mui/material";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api/client";
import EditIcon from "@mui/icons-material/Edit";
import InventoryIcon from "@mui/icons-material/Inventory";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloseIcon from "@mui/icons-material/Close";

interface ConceptCard {
  id: string;
  imageUrl: string;
  title: string;
  materials: string;
  status: string;
  isSkeleton?: boolean;
}




export function Stage2GarmentConcepts({ workspaceId, ws, onNext }: { workspaceId?: string; ws?: any; onNext?: () => void }) {
  const qc = useQueryClient();

  const { data: concepts = [], isLoading } = useQuery<ConceptCard[]>({
    queryKey: ["concepts", workspaceId],
    queryFn: async () => {
      const { data } = await api.get("/concepts", { params: { workspace_id: workspaceId } });
      const raw = Array.isArray(data) ? data : (data?.concepts ?? []);
      
      if (raw && raw.length > 0) {
        return raw
          .filter((c: any) => c.status !== "failed" && c.status !== "rejected")
          .map((c: any) => {
            const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
            const clean = (val: string | undefined) => (!val || UUID_RE.test(val) ? "" : val);

            // Pick the most meaningful garment descriptor available
            const garmentType = clean(c.combo?.silhouette_garment_type) || clean(c.combo?.silhouette_label) || "";
            const colorName   = c.combo?.color?.name || "";
            const fabricLabel = clean(c.combo?.fabric_label) || "";
            const brand       = clean(c.combo?.silhouette_brand) || "";

            // e.g. "Fiery Red Silk Dress" | "Silk Dress" | "Coral Custom" | "AI Concept"
            const titleParts = [colorName, fabricLabel, garmentType || brand].filter(Boolean);
            const rawTitle = titleParts.length > 0 ? titleParts.join(" ") : "AI Concept";
            
            // Deduplicate words (e.g. "Black Black knitted..." -> "Black knitted...")
            const words = rawTitle.split(" ");
            const uniqueWords = words.filter((w, i) => words.indexOf(w) === i);
            let title = uniqueWords.join(" ");
            
            const editCount = c.accumulated_edits?.length || 0;
            if (editCount > 0) {
              title = `${title} (Edited ${editCount})`;
            }

            // Subtitle: fabric • color (skip anything that looks like a UUID)
            const subParts = [fabricLabel || "Custom", colorName].filter(Boolean);
            let materials = subParts.join(" • ") || "Generated";
            
            if (editCount > 0) {
              materials = c.accumulated_edits![editCount - 1];
            }

            return {
              id: c._id,
              imageUrl: c.image?.gridfs_id ? `/api/v1/concepts/${c._id}/image` : `/api/v1/concepts/${c._id}/image`,
              title: title.charAt(0).toUpperCase() + title.slice(1),
              materials,
              status: c.status,
              isSkeleton: c.status === "generating",
            };
          });
      }

      // 2. Fallback to mock data backup if no real concepts exist yet
      const { data: mockData } = await api.get(`/workspace/${workspaceId}/variants?stage=2`);
      return mockData;
    },
    enabled: !!workspaceId,
    refetchInterval: (query) => {
      const data = query.state.data as ConceptCard[] | undefined;
      return data?.some(v => v.isSkeleton) ? 3000 : false;
    }
  });

  const editVariant = useMutation({
    mutationFn: async ({ variantId, instruction }: { variantId: string; instruction: string }) => {
      const { data } = await api.post(`/concepts/${variantId}/refine`, { instruction });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["concepts", workspaceId] }),
  });

  const attachInventory = useMutation({
    mutationFn: async (conceptId: string) => {
      // TODO: inventory attachment (future)
      console.log("Inventory attachment not yet implemented for", conceptId);
      return {};
    },
  });

  const showSkeleton = isLoading || ws?.status === "generating";
  const displayVariants: ConceptCard[] = showSkeleton
    ? Array.from({ length: 6 }).map((_, i) => ({
        id: `skeleton-${i}`,
        imageUrl: "",
        title: "",
        materials: "",
        status: "skeleton",
        isSkeleton: true,
      }))
    : concepts;

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
    { title: "01 Generated concepts", subtitle: "flat-lay · AI studio", images: displayVariants },
    { title: "02 Selected for refinement", subtitle: "editorial · lookbook", images: [] },
    { title: "03 Final variations", subtitle: "on-model · e-commerce", images: [] },
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
          {showSkeleton ? (
            <Skeleton variant="text" width={100} height={24} />
          ) : (
            <Box sx={{ display: "flex", flexWrap: "wrap" }}>
              {palettes.map(renderColor)}
              {palettes.length === 0 && <Typography sx={{ fontSize: 12, color: "text.disabled" }}>None selected</Typography>}
            </Box>
          )}
        </Box>
        <Box sx={{ minWidth: 150 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", color: "text.primary", mb: 1, textTransform: "uppercase" }}>SILHOUETTE</Typography>
          {showSkeleton ? (
            <Skeleton variant="text" width={100} height={24} />
          ) : (
            <>
              {silhouettes.map((el: any) => (
                <Typography key={el.element_id} sx={{ fontSize: 12, color: "text.secondary", mb: 0.5 }}>{getLabel(el)}</Typography>
              ))}
              {silhouettes.length === 0 && <Typography sx={{ fontSize: 12, color: "text.disabled" }}>None selected</Typography>}
            </>
          )}
        </Box>
        <Box sx={{ minWidth: 150 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", color: "text.primary", mb: 1, textTransform: "uppercase" }}>PATTERN</Typography>
          {showSkeleton ? (
            <Skeleton variant="text" width={100} height={24} />
          ) : (
            <>
              {patterns.map((el: any) => (
                <Typography key={el.element_id as string} sx={{ fontSize: 12, color: "text.secondary", mb: 0.5 }}>{getLabel(el)}</Typography>
              ))}
              {patterns.length === 0 && <Typography sx={{ fontSize: 12, color: "text.disabled" }}>None selected</Typography>}
            </>
          )}
        </Box>
        <Box sx={{ minWidth: 150 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", color: "text.primary", mb: 1, textTransform: "uppercase" }}>MATERIAL</Typography>
          {showSkeleton ? (
            <Skeleton variant="text" width={100} height={24} />
          ) : (
            <>
              {materials.map((el: any) => (
                <Typography key={el.element_id as string} sx={{ fontSize: 12, color: "text.secondary", mb: 0.5 }}>{getLabel(el)}</Typography>
              ))}
              {materials.length === 0 && <Typography sx={{ fontSize: 12, color: "text.disabled" }}>None selected</Typography>}
            </>
          )}
        </Box>
      </Box>

      {/* SECTIONS */}
      {sections.map((section, idx) => (
        <SectionCarousel 
          key={idx} 
          section={section} 
          editVariant={editVariant} 
          attachInventory={attachInventory}
          isCarousel={idx === 0}
        />
      ))}

      {/* FOOTER */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 6, pt: 4, borderTop: "1px solid #f0e4e2" }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary", textTransform: "uppercase" }}>
          STAGE 02 — GARMENT CONCEPTS
        </Typography>
        <Typography onClick={onNext} sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", cursor: "pointer", "&:hover": { color: "primary.main" } }}>
          NEXT — EDITORIAL, ON-MODEL →
        </Typography>
      </Box>
    </Box>
  );
}

function SectionCarousel({ section, editVariant, attachInventory, isCarousel = true }: { section: any, editVariant: any, attachInventory: any, isCarousel?: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  // Popover state
  const [editAnchorEl, setEditAnchorEl] = useState<HTMLElement | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editImgId, setEditImgId] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [editType, setEditType] = useState("all");
  const [popoverPosition, setPopoverPosition] = useState<"bottom" | "top">("bottom");

  const handleEditClick = (e: React.MouseEvent<HTMLElement>, imgId: string) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    if (window.innerHeight - rect.bottom < 350 && rect.top > 350) {
      setPopoverPosition("top");
    } else {
      setPopoverPosition("bottom");
    }
    setEditAnchorEl(e.currentTarget);
    setEditImgId(imgId);
    setIsEditOpen(true);
  };

  const closeEdit = () => {
    setIsEditOpen(false);
    // Do not set editAnchorEl to null here to prevent the Popover from flying away during exit animation.
  };

  useEffect(() => {
    const handleScroll = (e: Event) => {
      if (isEditOpen && editAnchorEl) {
        const popoverEl = document.getElementById("edit-popover");
        if (popoverEl && popoverEl.contains(e.target as Node)) {
          return;
        }
        closeEdit();
      }
    };
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [isEditOpen, editAnchorEl]);

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
        {isCarousel && (
          <Box sx={{ display: "flex", gap: 1 }}>
            <IconButton onClick={scrollLeft} size="small" sx={{ border: "1px solid #f0e4e2" }}>
              <ChevronLeftIcon />
            </IconButton>
            <IconButton onClick={scrollRight} size="small" sx={{ border: "1px solid #f0e4e2" }}>
              <ChevronRightIcon />
            </IconButton>
          </Box>
        )}
      </Box>

      <Box
        ref={isCarousel ? scrollRef : undefined}
        sx={{
          display: "flex",
          gap: 3,
          overflowX: isCarousel ? "auto" : "visible",
          flexWrap: isCarousel ? "nowrap" : "wrap",
          pb: 2,
          pt: 1,
          px: 1,
          "&::-webkit-scrollbar": { display: "none" },
          msOverflowStyle: "none",
          scrollbarWidth: "none",
        }}
      >
        {(section.images as ConceptCard[]).map((img: ConceptCard, i: number) => {
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
              onClick={() => { if (!img.isSkeleton) toggleSelect(img.id); }}
              >
                <Box sx={{ position: "relative", aspectRatio: "4/5", overflow: "hidden", bgcolor: "#f5f0ef" }}>
                  {img.isSkeleton ? (
                    <Skeleton variant="rectangular" width="100%" height="100%" sx={{ position: "absolute", top: 0, left: 0 }} />
                  ) : (
                    <CardMedia
                      component="img"
                      image={img.imageUrl}
                      sx={{ 
                        position: "absolute", top: 0, left: 0,
                        width: "100%", height: "100%", objectFit: "cover",
                        opacity: editVariant.isPending && editVariant.variables === img.id ? 0.5 : 1,
                        transition: "opacity 0.3s"
                      }}
                    />
                  )}
                  
                  <Chip 
                    label={`0${i + 1}`} 
                    size="small" 
                    sx={{ 
                      position: "absolute", top: 16, left: 16, 
                      bgcolor: "rgba(0,0,0,0.5)", color: "#fff", 
                      borderRadius: "8px", fontSize: 12, fontWeight: 700 
                    }} 
                  />

                  {!img.isSkeleton && (
                    <Box sx={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 1 }}>
                      <IconButton 
                        size="small" 
                        onClick={(e) => handleEditClick(e, img.id)}
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
                  )}
                  
                  {!img.isSkeleton && (
                    <Box sx={{ 
                      position: "absolute", bottom: 12, right: 12, 
                      width: 24, height: 24, borderRadius: "50%", 
                      border: isSelected ? "none" : "2px solid rgba(255,255,255,0.8)",
                      bgcolor: isSelected ? "#000" : "rgba(0,0,0,0.2)",
                      display: "flex", alignItems: "center", justifyContent: "center"
                    }}>
                      {isSelected && <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: "#fff" }} />}
                    </Box>
                  )}
                </Box>
                <CardContent sx={{ px: 2, py: 2.5 }}>
                  {img.isSkeleton ? (
                    <>
                      <Skeleton variant="text" width="60%" height={20} sx={{ mb: 0.5 }} />
                      <Skeleton variant="text" width="40%" height={16} />
                    </>
                  ) : (
                    <>
                      <Typography sx={{ fontWeight: 600, fontSize: 14, mb: 0.5, color: "text.primary" }}>{img.title}</Typography>
                      <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{img.materials}</Typography>
                    </>
                  )}
                </CardContent>
              </Card>
            </Box>
          );
        })}
      </Box>

      {/* Popover Edit Form */}
      <Popover
        id="edit-popover"
        open={isEditOpen}
        anchorEl={editAnchorEl}
        onClose={closeEdit}
        anchorOrigin={{ vertical: popoverPosition === "top" ? "top" : "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: popoverPosition === "top" ? "bottom" : "top", horizontal: "right" }}
        disableScrollLock
        slotProps={{
          paper: {
            sx: {
              mt: popoverPosition === "bottom" ? 1.5 : 0,
              mb: popoverPosition === "top" ? 1.5 : 0,
              p: 2.5,
              width: 320,
              borderRadius: "16px",
              border: "1px solid #f0e4e2",
              boxShadow: "0 8px 32px rgba(36,25,24,0.12)",
              position: "relative",
            }
          }
        }}
      >
        <IconButton
          size="small"
          onClick={closeEdit}
          sx={{ position: "absolute", top: 12, right: 12, color: "text.disabled" }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
        <Typography sx={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.05em", color: "text.primary", mb: 2, textTransform: "uppercase", pr: 4 }}>
          Edit AI Prompt
        </Typography>
        <TextField
          fullWidth
          placeholder='e.g. "Make the sleeves longer..."'
          value={editPrompt}
          onChange={(e) => setEditPrompt(e.target.value)}
          variant="outlined"
          size="small"
          multiline
          rows={2}
          sx={{
            mb: 2,
            "& .MuiOutlinedInput-root": {
              borderRadius: "8px",
              bgcolor: "#faf8f7",
              "& fieldset": { borderColor: "#e8dedd" },
              "&:hover fieldset": { borderColor: "#dfbfbc" },
              "&.Mui-focused fieldset": { borderColor: "primary.main" },
            }
          }}
        />
        <Typography sx={{ fontSize: 11, fontWeight: 700, color: "text.secondary", mb: 1, textTransform: "uppercase" }}>
          Current Components
        </Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
          <Chip label="Silk" size="small" onDelete={() => {}} sx={{ borderRadius: "6px", fontSize: 11 }} />
          <Chip label="Floral" size="small" onDelete={() => {}} sx={{ borderRadius: "6px", fontSize: 11 }} />
          <Chip label="V-Neck" size="small" onDelete={() => {}} sx={{ borderRadius: "6px", fontSize: 11 }} />
        </Box>
        <Typography sx={{ fontSize: 11, fontWeight: 700, color: "text.secondary", mb: 1, textTransform: "uppercase" }}>
          Add Component
        </Typography>
        <Select
          fullWidth
          value={editType}
          onChange={(e) => setEditType(e.target.value)}
          size="small"
          sx={{ 
            mb: 3,
            borderRadius: "8px", 
            bgcolor: "#faf8f7",
            "& fieldset": { borderColor: "#e8dedd" },
            "&:hover fieldset": { borderColor: "#dfbfbc" }
          }}
        >
          <MenuItem value="all">Select a component type</MenuItem>
          <MenuItem value="silhouette">Silhouette</MenuItem>
          <MenuItem value="palette">Palette</MenuItem>
          <MenuItem value="fabric">Fabric</MenuItem>
          <MenuItem value="pattern">Pattern</MenuItem>
        </Select>
        <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
          <Button
            variant="outlined"
            onClick={closeEdit}
            sx={{ flex: 1, borderRadius: "8px", color: "text.secondary", borderColor: "#f0e4e2", "&:hover": { borderColor: "text.secondary", bgcolor: "transparent" } }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            disableElevation
            onClick={() => {
              if (editImgId && editPrompt.trim()) {
                editVariant.mutate({ variantId: editImgId, instruction: editPrompt.trim() });
              }
              closeEdit();
            }}
            sx={{
              flex: 1,
              borderRadius: "8px",
              bgcolor: "text.primary",
              color: "#fff",
              fontWeight: 600,
              "&:hover": { bgcolor: "primary.main" }
            }}
          >
            Generate ✨
          </Button>
        </Box>
      </Popover>
    </Box>
  );
}
