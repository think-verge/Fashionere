/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useEffect } from "react";
import { Box, Typography, IconButton, Card, CardMedia, CardContent, Chip, Skeleton, TextField, Button, Popover, Tooltip, Select, MenuItem } from "@mui/material";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api/client";
import InventoryIcon from "@mui/icons-material/Inventory";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloseIcon from "@mui/icons-material/Close";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";

interface ConceptCard {
  id: string;
  imageUrl: string;
  title: string;
  materials: string;
  status: string;
  isSkeleton?: boolean;
  isVariant?: boolean;
  parentId?: string;
}

function mapRaw(c: any): ConceptCard {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
  const clean = (val: string | undefined) => (!val || UUID_RE.test(val) ? "" : val);

  const garmentType = clean(c.combo?.silhouette_garment_type) || clean(c.combo?.silhouette_label) || "";
  const colorName   = c.combo?.color?.name || "";
  const fabricLabel = clean(c.combo?.fabric_label) || "";
  const brand       = clean(c.combo?.silhouette_brand) || "";

  const titleParts = [colorName, fabricLabel, garmentType || brand].filter(Boolean);
  const rawTitle = titleParts.length > 0 ? titleParts.join(" ") : "AI Concept";
  const words = rawTitle.split(" ");
  const uniqueWords = words.filter((w, i) => words.indexOf(w) === i);
  let title = uniqueWords.join(" ");

  const editCount = c.accumulated_edits?.length || 0;
  if (editCount > 0) title = `${title} (Edited ${editCount})`;

  const subParts = [fabricLabel || "Custom", colorName].filter(Boolean);
  let materials = subParts.join(" • ") || "Generated";
  if (editCount > 0) materials = c.accumulated_edits![editCount - 1];

  return {
    id: c._id,
    imageUrl: `/api/v1/concepts/${c._id}/image`,
    title: title.charAt(0).toUpperCase() + title.slice(1),
    materials,
    status: c.status,
    isSkeleton: c.status === "pending" || c.status === "generating",
    isVariant: !!c.parent_concept || (c.accumulated_edits && c.accumulated_edits.length > 0),
    parentId: c.parent_concept,
  };
}

export function Stage2GarmentConcepts({ workspaceId, ws, onNext }: { workspaceId?: string; ws?: any; onNext?: () => void }) {
  const qc = useQueryClient();

  // Section 01: all concepts (not rejected/failed)
  const { data: allConcepts = [], isLoading } = useQuery<ConceptCard[]>({
    queryKey: ["concepts", workspaceId],
    queryFn: async () => {
      const { data } = await api.get("/concepts", { params: { workspace_id: workspaceId } });
      const raw = Array.isArray(data) ? data : (data?.concepts ?? []);
      if (raw.length > 0) {
        return raw.filter((c: any) => c.status !== "failed").map(mapRaw);
      }
      return [];
    },
    enabled: !!workspaceId,
    refetchInterval: (query) => {
      const d = query.state.data as ConceptCard[] | undefined;
      return d?.some(v => v.isSkeleton) ? 3000 : false;
    },
  });

  // Removed the duplicate declarations.
  
  const showSkeleton = isLoading || ws?.status === "generating";

  const displaySection01: ConceptCard[] = showSkeleton
    ? Array.from({ length: 6 }).map((_, i) => ({
        id: `skeleton-${i}`, imageUrl: "", title: "", materials: "", status: "skeleton", isSkeleton: true, isVariant: false,
      }))
    : allConcepts.filter(c => !c.isVariant);

  const approvedConcepts = displaySection01.filter(c => c.status === "approved");

  // Section 03: variants of approved concepts
  const approvedIds = new Set(approvedConcepts.map(c => c.id));
  const finalVariants = allConcepts.filter(c => c.isVariant && c.parentId && approvedIds.has(c.parentId));

  // Mutations
  const approveConcept = useMutation({
    mutationFn: async (conceptId: string) => {
      const { data } = await api.patch(`/concepts/${conceptId}`, { status: "approved" });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["concepts", workspaceId] }),
  });

  const rejectConcept = useMutation({
    mutationFn: async (conceptId: string) => {
      const { data } = await api.patch(`/concepts/${conceptId}`, { status: "rejected" });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["concepts", workspaceId] }),
  });

  const refineVariant = useMutation({
    mutationFn: async ({ conceptId, instruction }: { conceptId: string; instruction: string }) => {
      const { data } = await api.post(`/concepts/${conceptId}/refine`, { instruction });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["concepts", workspaceId] });
    },
  });

  const { data: inventoryData = [] } = useQuery({
    queryKey: ["inventory"],
    queryFn: async () => {
      const { data } = await api.get("/inventory/garments");
      return data;
    }
  });

  // Display state handled above

  // Workspace metadata
  const palettes    = ws?.elements?.filter((e: any) => e.element_type === "color") || [];
  const silhouettes = ws?.elements?.filter((e: any) => e.element_type === "silhouette") || [];
  const patterns    = ws?.elements?.filter((e: any) => e.element_type === "pattern") || [];
  const matEls      = ws?.elements?.filter((e: any) => e.element_type === "fabric") || [];

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

  return (
    <Box sx={{ mt: 1, mb: 1, width: "100%" }}>
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

      <Typography sx={{ fontSize: 44, color: "text.primary", mb: 4, letterSpacing: "-0.02em", fontFamily: "'Literata', Georgia, serif" }}>
        {ws?.name || "Coastal ease"}
      </Typography>

      {/* CARRIED FROM STAGE 01 */}
      <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", mb: 2 }}>
        CARRIED FROM STAGE 01
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 6, mb: 4 }}>
        <Box sx={{ minWidth: 150 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: "text.primary", mb: 1, textTransform: "uppercase" }}>PALETTE</Typography>
          {showSkeleton ? <Skeleton variant="text" width={100} height={24} /> : (
            <Box sx={{ display: "flex", flexWrap: "wrap" }}>
              {palettes.map(renderColor)}
              {palettes.length === 0 && <Typography sx={{ fontSize: 12, color: "text.disabled" }}>None selected</Typography>}
            </Box>
          )}
        </Box>
        <Box sx={{ minWidth: 150 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: "text.primary", mb: 1, textTransform: "uppercase" }}>SILHOUETTE</Typography>
          {showSkeleton ? <Skeleton variant="text" width={100} height={24} /> : (
            <>
              {silhouettes.map((el: any) => <Typography key={el.element_id} sx={{ fontSize: 12, color: "text.secondary" }}>{getLabel(el)}</Typography>)}
              {silhouettes.length === 0 && <Typography sx={{ fontSize: 12, color: "text.disabled" }}>None selected</Typography>}
            </>
          )}
        </Box>
        <Box sx={{ minWidth: 150 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: "text.primary", mb: 1, textTransform: "uppercase" }}>PATTERN</Typography>
          {showSkeleton ? <Skeleton variant="text" width={100} height={24} /> : (
            <>
              {patterns.map((el: any) => <Typography key={el.element_id as string} sx={{ fontSize: 12, color: "text.secondary" }}>{getLabel(el)}</Typography>)}
              {patterns.length === 0 && <Typography sx={{ fontSize: 12, color: "text.disabled" }}>None selected</Typography>}
            </>
          )}
        </Box>
        <Box sx={{ minWidth: 150 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: "text.primary", mb: 1, textTransform: "uppercase" }}>MATERIAL</Typography>
          {showSkeleton ? <Skeleton variant="text" width={100} height={24} /> : (
            <>
              {matEls.map((el: any) => <Typography key={el.element_id as string} sx={{ fontSize: 12, color: "text.secondary" }}>{getLabel(el)}</Typography>)}
              {matEls.length === 0 && <Typography sx={{ fontSize: 12, color: "text.disabled" }}>None selected</Typography>}
            </>
          )}
        </Box>
      </Box>

      {/* Section 01 */}
      <ConceptSection
        title="01 Generated concepts"
        subtitle="flat-lay · AI studio"
        hint="Click a card to select it for refinement in section 02"
        images={displaySection01}
        isCarousel
        actionIcon="approve"
        onAction={(id) => approveConcept.mutate(id)}
        onCardClick={(id) => {
          const isApproved = approvedConcepts.some(c => c.id === id);
          if (isApproved) rejectConcept.mutate(id);
          else approveConcept.mutate(id);
        }}
        selectedIds={approvedConcepts.map(c => c.id)}
        inventoryData={inventoryData}
        isLoading={ws?.status === "generating"}
      />

      {/* Section 02 */}
      <ConceptSection
        title="02 Selected for refinement"
        subtitle="editorial · lookbook"
        hint="Click ✨ to create a final variation · Click ✗ to remove from selection."
        images={approvedConcepts}
        isCarousel={false}
        actionIcon="refine"
        onAction={(id, instruction) => refineVariant.mutate({ conceptId: id, instruction: instruction ?? "" })}
        onSecondaryAction={(id) => rejectConcept.mutate(id)}
        actionPending={refineVariant.isPending}
        pendingId={refineVariant.variables?.conceptId}
        inventoryData={inventoryData}
        isLoading={ws?.status === "generating"}
      />

      {/* Section 03 */}
      <ConceptSection
        title="03 Final variations"
        subtitle="on-model · e-commerce"
        hint="Refined outputs appear here — ready for production"
        images={finalVariants}
        isCarousel={false}
        inventoryData={inventoryData}
        isLoading={ws?.status === "generating"}
      />

      {/* FOOTER */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 2, pt: 2, borderTop: "1px solid #f0e4e2" }}>
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

// ─── Shared section component ─────────────────────────────────────────────────

interface SectionProps {
  title: string;
  subtitle: string;
  hint?: string;
  images: ConceptCard[];
  isCarousel?: boolean;
  actionIcon?: "approve" | "refine";
  onAction?: (id: string, instruction?: string) => void;
  onSecondaryAction?: (id: string) => void;
  actionPending?: boolean;
  pendingId?: string;
  onCardClick?: (id: string) => void;
  selectedIds?: string[];
  inventoryData?: any[];
  isLoading?: boolean;
}

function ConceptSection({
  title, subtitle, hint, images, isCarousel = true,
  actionIcon, onAction, onSecondaryAction, actionPending, pendingId,
  onCardClick, selectedIds = [], inventoryData = [], isLoading = false
}: SectionProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isEmpty = images.length === 0 && !isLoading;

  const [refineAnchorEl, setRefineAnchorEl] = useState<HTMLElement | null>(null);
  const [isRefineOpen, setIsRefineOpen] = useState(false);
  const [refineId, setRefineId] = useState<string | null>(null);
  const [refinePrompt, setRefinePrompt] = useState("");
  const [editType, setEditType] = useState("all");

  const [popoverPosition, setPopoverPosition] = useState<"bottom" | "top">("bottom");

  const [invAnchorEl, setInvAnchorEl] = useState<HTMLElement | null>(null);
  const [isInvOpen, setIsInvOpen] = useState(false);
  const [invId, setInvId] = useState<string | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (isRefineOpen) setIsRefineOpen(false);
      if (isInvOpen) setIsInvOpen(false);
    };
    
    // Listen to window scroll
    window.addEventListener("scroll", handleScroll, { passive: true });
    
    // Listen to horizontal container scroll
    const el = scrollRef.current;
    if (el) el.addEventListener("scroll", handleScroll, { passive: true });
    
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (el) el.removeEventListener("scroll", handleScroll);
    };
  }, [isRefineOpen, isInvOpen]);

  const openRefine = (e: React.MouseEvent<HTMLElement>, id: string) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    if (window.innerHeight - rect.bottom < 350 && rect.top > 350) {
      setPopoverPosition("top");
    } else {
      setPopoverPosition("bottom");
    }
    setRefineId(id);
    setRefinePrompt("");
    setRefineAnchorEl(e.currentTarget);
    setIsRefineOpen(true);
  };

  const closeRefine = () => { setIsRefineOpen(false); };

  const submitRefine = () => {
    if (refineId && refinePrompt.trim() && onAction) onAction(refineId, refinePrompt.trim());
    closeRefine();
  };

  const openInv = (e: React.MouseEvent<HTMLElement>, id: string) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    if (window.innerHeight - rect.bottom < 350 && rect.top > 350) {
      setPopoverPosition("top");
    } else {
      setPopoverPosition("bottom");
    }
    setInvId(id);
    setInvAnchorEl(e.currentTarget);
    setIsInvOpen(true);
  };

  const closeInv = () => { setIsInvOpen(false); };

  const submitInv = (type: string) => {
    console.log("Attached", type, "to concept", invId);
    closeInv();
  };

  const scrollLeft  = () => scrollRef.current?.scrollBy({ left: -340, behavior: "smooth" });
  const scrollRight = () => scrollRef.current?.scrollBy({ left: 340, behavior: "smooth" });

  return (
    <Box sx={{ mb: 4 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", mb: 1 }}>
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 2 }}>
          <Typography sx={{ fontSize: 20, color: "text.primary", fontFamily: "'Literata', Georgia, serif" }}>
            <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "Inter, sans-serif", letterSpacing: "0.05em", marginRight: "12px", color: "#999" }}>
              {title.split(" ")[0]}
            </span>
            {title.split(" ").slice(1).join(" ")}
          </Typography>
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{subtitle}</Typography>
        </Box>
        {isCarousel && !isEmpty && (
          <Box sx={{ display: "flex", gap: 1 }}>
            <IconButton onClick={scrollLeft} size="small" sx={{ border: "1px solid #f0e4e2" }}><ChevronLeftIcon /></IconButton>
            <IconButton onClick={scrollRight} size="small" sx={{ border: "1px solid #f0e4e2" }}><ChevronRightIcon /></IconButton>
          </Box>
        )}
      </Box>

      {hint && !isEmpty && (
        <Typography sx={{ fontSize: 11, color: "text.disabled", mb: 2, fontStyle: "italic" }}>{hint}</Typography>
      )}

      {isEmpty ? (
        <Box sx={{
          height: 200, border: "1.5px dashed #e8dedd", borderRadius: "16px",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, bgcolor: "#faf8f7",
        }}>
          <Typography sx={{ fontSize: 13, color: "text.disabled", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Nothing here yet
          </Typography>
          {hint && (
            <Typography sx={{ fontSize: 12, color: "text.disabled", textAlign: "center", px: 4 }}>{hint}</Typography>
          )}
        </Box>
      ) : (
        <Box
          ref={isCarousel ? scrollRef : undefined}
          sx={{
            display: "flex", gap: 3,
            overflowX: isCarousel ? "auto" : "visible",
            flexWrap: isCarousel ? "nowrap" : "wrap",
            pb: 2, pt: 1, px: 1,
            "&::-webkit-scrollbar": { display: "none" },
            msOverflowStyle: "none", scrollbarWidth: "none",
          }}
        >
          {isLoading && images.length === 0 ? (
            [1, 2, 3].map((i) => (
              <Box key={`loader-${i}`} sx={{ minWidth: 300, flexShrink: 0, width: 300 }}>
                <Card sx={{
                  position: "relative", borderRadius: "24px",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.06)", bgcolor: "#fff",
                  border: "1px solid #f5f0ef", borderBottom: "3px solid #e8dedd",
                  overflow: "hidden"
                }}>
                  <Box sx={{ position: "relative", aspectRatio: "4/5", overflow: "hidden", bgcolor: "#f5f0ef" }}>
                    <Skeleton variant="rectangular" width="100%" height="100%" sx={{ position: "absolute", top: 0, left: 0 }} />
                  </Box>
                  <CardContent sx={{ p: 2, pb: "16px !important", bgcolor: "#fff" }}>
                    <Skeleton variant="text" width="60%" height={20} sx={{ mb: 0.5 }} />
                    <Skeleton variant="text" width="40%" height={16} />
                  </CardContent>
                </Card>
              </Box>
            ))
          ) : (
            images.map((img, i) => {
              const isSelected = selectedIds.includes(img.id);
              return (
              <Box key={img.id} sx={{ minWidth: 300, flexShrink: 0, width: 300 }}>
              <Card sx={{
                position: "relative", borderRadius: "24px",
                boxShadow: isSelected ? "0 0 0 2px #000" : "0 8px 24px rgba(0,0,0,0.06)", bgcolor: "#fff",
                border: "1px solid #f5f0ef", borderBottom: "3px solid #e8dedd",
                overflow: "hidden", transition: "all 0.2s ease",
                opacity: actionPending && pendingId === img.id ? 0.6 : 1,
                cursor: onCardClick ? "pointer" : "default"
              }}
              onClick={() => { if (!img.isSkeleton && onCardClick) onCardClick(img.id); }}
              >
                <Box sx={{ position: "relative", aspectRatio: "4/5", overflow: "hidden", bgcolor: "#f5f0ef" }}>
                  {img.isSkeleton ? (
                    <Skeleton variant="rectangular" width="100%" height="100%" sx={{ position: "absolute", top: 0, left: 0 }} />
                  ) : (
                    <CardMedia
                      component="img"
                      image={img.imageUrl}
                      sx={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  )}

                  <Chip
                    label={`0${i + 1}`}
                    size="small"
                    sx={{ position: "absolute", top: 16, left: 16, bgcolor: "rgba(0,0,0,0.5)", color: "#fff", borderRadius: "8px", fontSize: 12, fontWeight: 700 }}
                  />

                  {!img.isSkeleton && (
                    <Box sx={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 1 }}>
                      {actionIcon === "refine" && onAction && (
                        <Tooltip title="Create final variation (03)">
                          <IconButton
                            size="small"
                            onClick={(e) => openRefine(e, img.id)}
                            sx={{ bgcolor: "rgba(255,255,255,0.9)", "&:hover": { bgcolor: "#fff" }, boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}
                          >
                            <AutoFixHighIcon fontSize="small" sx={{ color: "text.primary" }} />
                          </IconButton>
                        </Tooltip>
                      )}

                      <Tooltip title="Attach Inventory">
                        <IconButton
                          size="small"
                          onClick={(e) => openInv(e, img.id)}
                          sx={{ bgcolor: "rgba(255,255,255,0.9)", "&:hover": { bgcolor: "#fff" }, boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}
                        >
                          <InventoryIcon fontSize="small" sx={{ color: "text.primary" }} />
                        </IconButton>
                      </Tooltip>

                      {onSecondaryAction && (
                        <Tooltip title="Remove from selection">
                          <IconButton
                            size="small"
                            onClick={(e) => { e.stopPropagation(); onSecondaryAction(img.id); }}
                            sx={{ bgcolor: "rgba(255,255,255,0.9)", "&:hover": { bgcolor: "#fff" }, boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}
                          >
                            <CloseIcon fontSize="small" sx={{ color: "#c62828" }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  )}

                  {!img.isSkeleton && actionIcon === "approve" && (
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
          })
          )}
        </Box>
      )}

      {/* Refine popover */}
      <Popover
        open={isRefineOpen}
        anchorEl={refineAnchorEl}
        onClose={closeRefine}
        anchorOrigin={{ vertical: popoverPosition === "top" ? "top" : "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: popoverPosition === "top" ? "bottom" : "top", horizontal: "center" }}
        disableScrollLock
        slotProps={{ paper: { sx: { 
          mt: popoverPosition === "bottom" ? 1.5 : 0, 
          mb: popoverPosition === "top" ? 1.5 : 0,
          p: 2.5, width: 320, borderRadius: "16px", border: "1px solid #f0e4e2", boxShadow: "0 8px 32px rgba(36,25,24,0.12)", position: "relative" 
        } } }}
      >
        <IconButton size="small" onClick={closeRefine} sx={{ position: "absolute", top: 12, right: 12, color: "text.disabled" }}>
          <CloseIcon fontSize="small" />
        </IconButton>
        <Typography sx={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.05em", color: "text.primary", mb: 2, textTransform: "uppercase", pr: 4 }}>
          {actionIcon === "approve" ? "Edit AI Prompt" : "Refine for final"}
        </Typography>
        <TextField
          fullWidth
          placeholder='e.g. "Make the sleeves longer..."'
          value={refinePrompt}
          onChange={(e) => setRefinePrompt(e.target.value)}
          variant="outlined"
          size="small"
          multiline
          rows={2}
          sx={{
            mb: 2,
            "& .MuiOutlinedInput-root": {
              borderRadius: "8px", bgcolor: "#faf8f7",
              "& fieldset": { borderColor: "#e8dedd" },
              "&:hover fieldset": { borderColor: "#dfbfbc" },
              "&.Mui-focused fieldset": { borderColor: "primary.main" },
            },
          }}
        />
        
        {/* Restored lower half of edit popover */}
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
            mb: 3, borderRadius: "8px", bgcolor: "#faf8f7",
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

        <Box sx={{ display: "flex", gap: 1 }}>
          <Button variant="outlined" onClick={closeRefine} sx={{ flex: 1, borderRadius: "8px", color: "text.secondary", borderColor: "#f0e4e2" }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disableElevation
            onClick={submitRefine}
            disabled={!refinePrompt.trim()}
            sx={{ flex: 1, borderRadius: "8px", bgcolor: "text.primary", color: "#fff", fontWeight: 600, "&:hover": { bgcolor: "primary.main" } }}
          >
            Generate ✨
          </Button>
        </Box>
      </Popover>


      {/* Inventory popover */}
      <Popover
        open={isInvOpen}
        anchorEl={invAnchorEl}
        onClose={closeInv}
        anchorOrigin={{ vertical: "center", horizontal: "right" }}
        transformOrigin={{ vertical: "center", horizontal: "left" }}
        disableScrollLock
        slotProps={{ paper: { sx: { 
          ml: 1.5,
          p: 2.5, width: 280, borderRadius: "16px", border: "1px solid #f0e4e2", boxShadow: "0 8px 32px rgba(36,25,24,0.12)", position: "relative" 
        } } }}
      >
        <IconButton size="small" onClick={closeInv} sx={{ position: "absolute", top: 12, right: 12, color: "text.disabled" }}>
          <CloseIcon fontSize="small" />
        </IconButton>
        <Typography sx={{ fontSize: 11, fontWeight: 700, color: "text.primary", textTransform: "uppercase", letterSpacing: "0.1em", mb: 2 }}>
          Attach Inventory
        </Typography>
        <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 2 }}>
          Select an available garment type from the inventory to attach to this concept.
        </Typography>
        <Box sx={{ 
          display: "flex", flexDirection: "column", gap: 1,
          maxHeight: 200, overflowY: "auto",
          "&::-webkit-scrollbar": { display: "none" },
          scrollbarWidth: "none"
        }}>
          {isLoading ? (
            <>
              <Skeleton variant="rectangular" width="100%" height={36} sx={{ borderRadius: "8px" }} />
              <Skeleton variant="rectangular" width="100%" height={36} sx={{ borderRadius: "8px" }} />
              <Skeleton variant="rectangular" width="100%" height={36} sx={{ borderRadius: "8px" }} />
              <Skeleton variant="rectangular" width="100%" height={36} sx={{ borderRadius: "8px" }} />
            </>
          ) : inventoryData.length === 0 ? (
            <Typography sx={{ fontSize: 13, color: "text.disabled", fontStyle: "italic" }}>No inventory found.</Typography>
          ) : (
            inventoryData.map((inv: any) => (
              <Button
                key={inv.garment_type}
                variant="outlined"
                onClick={() => submitInv(inv.garment_type)}
                sx={{ justifyContent: "space-between", color: "text.primary", borderColor: "#f0e4e2", borderRadius: "8px", "&:hover": { borderColor: "primary.main", bgcolor: "#fff0ef" } }}
              >
                <span style={{ fontSize: 13, textTransform: "capitalize" }}>{inv.garment_type}</span>
                <span style={{ fontSize: 12, color: "#999", backgroundColor: "#f5f5f5", padding: "2px 6px", borderRadius: "4px" }}>Qty: {inv.count}</span>
              </Button>
            ))
          )}
        </Box>
      </Popover>
    </Box>
  );
}
