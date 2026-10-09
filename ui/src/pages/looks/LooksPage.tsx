import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import {
  Box, Grid, Card, CardActionArea, CardMedia, CardContent,
  Typography, Chip, Button, Skeleton, Menu, MenuItem
} from "@mui/material";
import AddPhotoAlternateIcon from "@mui/icons-material/AddPhotoAlternate";
import FilterListIcon from "@mui/icons-material/FilterList";
import { PageHeader } from "../../components/PageHeader";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api/client";

interface LookSummary {
  id: string;
  brand: string;
  name?: string;
  season: string;
  year: number;
  thumbnail?: string;
  garment_count: number;
  source_type: "retail" | "runway";
}

interface LooksResponse {
  looks: LookSummary[];
  next_cursor: string | null;
  total: number;
}

interface FiltersResponse {
  brands: string[];
  garment_types: string[];
}

export default function LooksPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const type = user?.role === "retail_chain" ? "retail" : "runway";

  const [selectedBrand, setSelectedBrand] = useState<string[]>([]);
  const [selectedGarmentType, setSelectedGarmentType] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortAnchor, setSortAnchor] = useState<null | HTMLElement>(null);
  const [sort, setSort] = useState("latest");
  
  const [searchParams] = useSearchParams();
  const q = searchParams.get("q") || "";

  // Fetch available filter options
  const { data: filters } = useQuery<FiltersResponse>({
    queryKey: ["looks-filters", type],
    queryFn: async () => {
      const { data } = await api.get("/looks/filters", { params: { type } });
      return data;
    },
  });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isFetching } =
    useInfiniteQuery<LooksResponse>({
      queryKey: ["looks", type, selectedBrand, selectedGarmentType, q, sort],
      queryFn: async ({ pageParam }) => {
        const params: Record<string, string> = { type, limit: "24" };
        if (pageParam) params.cursor = pageParam as string;
        if (selectedBrand.length > 0) params.brand = selectedBrand.join(",");
        if (selectedGarmentType.length > 0) params.garment_type = selectedGarmentType.join(",");
        if (q) params.q = q;
        if (sort) params.sort = sort;
        const { data } = await api.get("/looks", { params });
        return data;
      },
      getNextPageParam: (last) => last.next_cursor ?? undefined,
      initialPageParam: undefined,
    });

  const looks = data?.pages.flatMap((p) => p.looks) ?? [];
  const total = data?.pages[0]?.total ?? 0;
  const hasFilters = selectedBrand.length > 0 || selectedGarmentType.length > 0;

  function clearFilters() {
    setSelectedBrand([]);
    setSelectedGarmentType([]);
  }

  return (
    <Box>
      <PageHeader
        eyebrow={type === "retail" ? "Retail Looks" : "Runway Looks"}
        heading="Curated Looks"
        description="Browse and deconstruct looks from your selected sources. Add elements to a workspace to start building your collection."
      />

      {/* Top Action Bar */}
      <Box sx={{ mb: filtersOpen ? 2 : 4 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2 }}>
          
          {/* Left side: Filters + Total Looks */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Button
            variant="text"
            size="small"
            startIcon={<FilterListIcon fontSize="small" />}
            onClick={() => setFiltersOpen((v) => !v)}
            sx={{
              color: filtersOpen || hasFilters ? "primary.main" : "text.secondary",
              fontWeight: hasFilters ? 600 : 500,
              fontSize: 13,
              borderRadius: "20px",
              px: 2,
              py: 0.75,
              bgcolor: hasFilters ? "#fff0ef" : "rgba(255, 255, 255, 0.6)",
              backdropFilter: "blur(8px)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              border: "1px solid",
              borderColor: hasFilters ? "transparent" : "rgba(0,0,0,0.06)",
              transition: "all 0.2s ease-in-out",
              "&:hover": { 
                bgcolor: "#fff0ef", 
                color: "primary.main", 
                transform: "translateY(-1px)", 
                boxShadow: "0 4px 12px rgba(0,0,0,0.08)" 
              },
            }}
          >
            Filters {hasFilters && <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "primary.main", ml: 1 }} />}
          </Button>

          <Typography sx={{ color: "text.secondary", fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            {total} look{total !== 1 ? "s" : ""}
          </Typography>
        </Box>

        {/* Right side: Sort by */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Sort by:</Typography>
          <Typography 
            onClick={(e) => setSortAnchor(e.currentTarget)} 
            sx={{ fontSize: 13, fontWeight: 600, color: "text.primary", display: "flex", alignItems: "center", cursor: "pointer" }}
          >
            {sort === "latest" ? "Latest Runway" : "Oldest Runway"} <Box component="span" sx={{ fontSize: 10, ml: 0.5 }}>▼</Box>
          </Typography>
          <Menu 
            anchorEl={sortAnchor} 
            open={Boolean(sortAnchor)} 
            onClose={() => setSortAnchor(null)}
            slotProps={{ paper: { sx: { borderRadius: "12px", mt: 1, boxShadow: "0 4px 20px rgba(0,0,0,0.08)" } } }}
          >
            <MenuItem onClick={() => { setSort("latest"); setSortAnchor(null); }} sx={{ fontSize: 13, fontWeight: sort === "latest" ? 600 : 400 }}>Latest Runway</MenuItem>
            <MenuItem onClick={() => { setSort("oldest"); setSortAnchor(null); }} sx={{ fontSize: 13, fontWeight: sort === "oldest" ? 600 : 400 }}>Oldest Runway</MenuItem>
          </Menu>
        </Box>
      </Box>

      {/* Active Filters Row */}
      {hasFilters && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mt: 2 }}>
          <Typography sx={{ fontSize: 13, color: "text.secondary", mr: 0.5, ml: 1 }}>Active:</Typography>
          {selectedBrand.map(b => (
            <Chip
              key={b}
              label={`${b} ×`}
              size="small"
              onClick={() => setSelectedBrand(prev => prev.filter(x => x !== b))}
              sx={{ 
                bgcolor: "#fbebed", 
                color: "primary.main", 
                fontWeight: 600, 
                fontSize: 13, 
                height: 28, 
                borderRadius: "14px", 
                "&:hover": { bgcolor: "#f5d5d8" }
              }}
            />
          ))}
          {selectedGarmentType.map(g => (
            <Chip
              key={g}
              label={`${g} ×`}
              size="small"
              onClick={() => setSelectedGarmentType(prev => prev.filter(x => x !== g))}
              sx={{ 
                bgcolor: "#fbebed", 
                color: "primary.main", 
                fontWeight: 600, 
                fontSize: 13, 
                height: 28, 
                borderRadius: "14px", 
                "&:hover": { bgcolor: "#f5d5d8" }
              }}
            />
          ))}
          <Typography
            onClick={clearFilters}
            sx={{ 
              fontSize: 13, 
              color: "text.secondary", 
              ml: 1, 
              cursor: "pointer", 
              textDecoration: "underline",
              "&:hover": { color: "text.primary" } 
            }}
          >
            Reset
          </Typography>
        </Box>
      )}
      </Box>

      {/* Filter Dropdown */}
      {filtersOpen && (
        <Box
          sx={{
            mb: 4,
              p: 3,
              border: "1px solid rgba(0,0,0,0.06)",
              borderRadius: "16px",
              bgcolor: "#ffffff",
              boxShadow: "0 4px 20px rgba(0,0,0,0.04)",
              display: "flex",
              flexDirection: "column",
              gap: 3,
              animation: "fadeIn 0.3s ease-out forwards",
              "@keyframes fadeIn": {
                from: { opacity: 0, transform: "translateY(-10px)" },
                to: { opacity: 1, transform: "translateY(0)" }
              }
            }}
          >
            {/* Brand filter */}
            {filters?.brands && filters.brands.length > 0 && (
              <Box>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "text.secondary" }}>
                    Brand
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                  {filters.brands.slice(0, 30).map((brand) => (
                    <Chip
                      key={brand}
                      label={brand}
                      size="small"
                      clickable
                      onClick={() => setSelectedBrand(prev => prev.includes(brand) ? prev.filter(x => x !== brand) : [...prev, brand])}
                      sx={{
                        fontSize: 12,
                        height: 30,
                        borderRadius: "15px",
                        bgcolor: selectedBrand.includes(brand) ? "#fbebed" : "#ffffff",
                        color: selectedBrand.includes(brand) ? "primary.main" : "text.primary",
                        border: "1px solid",
                        borderColor: selectedBrand.includes(brand) ? "primary.main" : "rgba(0,0,0,0.12)",
                        fontWeight: selectedBrand.includes(brand) ? 600 : 500,
                        transition: "all 0.2s",
                        "&:hover": {
                          bgcolor: selectedBrand.includes(brand) ? "#f5d5d8" : "#fafafa",
                          borderColor: selectedBrand.includes(brand) ? "primary.main" : "rgba(0,0,0,0.2)",
                          transform: "translateY(-1px)",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
                        },
                      }}
                    />
                  ))}
                </Box>
              </Box>
            )}

            {/* Garment type filter */}
            {filters?.garment_types && filters.garment_types.length > 0 && (
              <Box>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "text.secondary" }}>
                    Garment Type
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                  {filters.garment_types.map((gt) => (
                    <Chip
                      key={gt}
                      label={gt}
                      size="small"
                      clickable
                      onClick={() => setSelectedGarmentType(prev => prev.includes(gt) ? prev.filter(x => x !== gt) : [...prev, gt])}
                      sx={{
                        fontSize: 12,
                        height: 30,
                        borderRadius: "15px",
                        bgcolor: selectedGarmentType.includes(gt) ? "primary.main" : "#ffffff",
                        color: selectedGarmentType.includes(gt) ? "#fff" : "text.primary",
                        border: "1px solid",
                        borderColor: selectedGarmentType.includes(gt) ? "primary.main" : "rgba(0,0,0,0.12)",
                        fontWeight: selectedGarmentType.includes(gt) ? 600 : 500,
                        transition: "all 0.2s",
                        "&:hover": {
                          bgcolor: selectedGarmentType.includes(gt) ? "primary.dark" : "#fafafa",
                          borderColor: selectedGarmentType.includes(gt) ? "primary.dark" : "rgba(0,0,0,0.2)",
                          transform: "translateY(-1px)",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
                        },
                      }}
                    />
                  ))}
                </Box>
              </Box>
            )}
        </Box>
      )}

      {isLoading || (isFetching && !isFetchingNextPage) ? (
        <Grid container spacing={3}>
          {Array.from({ length: 12 }).map((_, i) => (
            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={i}>
              <Card sx={{ 
                height: "100%", 
                borderRadius: "24px", 
                bgcolor: "rgba(255, 255, 255, 0.4)", 
                backdropFilter: "blur(20px)", 
                boxShadow: "0 8px 32px rgba(160, 140, 130, 0.05)", 
                border: "1px solid rgba(255,255,255,0.7)", 
                display: "flex", flexDirection: "column", alignItems: "stretch" 
              }}>
                <Box sx={{ position: "relative", bgcolor: "transparent", aspectRatio: "3/4", overflow: "hidden", p: 1.5, pb: 0 }}>
                  <Skeleton variant="rectangular" sx={{ width: "100%", height: "100%", borderRadius: "16px" }} animation="wave" />
                </Box>
                <CardContent sx={{ flex: 1, p: 2.5, "&:last-child": { pb: 2.5 } }}>
                  <Skeleton width="70%" height={24} animation="wave" sx={{ mb: 1, transform: "none" }} />
                  <Skeleton width="40%" height={16} animation="wave" sx={{ transform: "none" }} />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : looks.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 12, px: 3, bgcolor: "rgba(255,255,255,0.5)", borderRadius: "24px", border: "1px dashed rgba(0,0,0,0.1)" }}>
          <Typography sx={{ color: "text.primary", fontFamily: "'Literata', Georgia, serif", fontSize: 22, fontWeight: 600, mb: 1 }}>
            {hasFilters ? "No looks match these filters" : "No looks found"}
          </Typography>
          <Typography sx={{ color: "text.secondary", fontSize: 15 }}>
            {hasFilters ? "Try removing some filters to see more results." : "Try adjusting your source preferences or check back later."}
          </Typography>
          {hasFilters && (
            <Button onClick={clearFilters} variant="contained" disableElevation sx={{ mt: 3, borderRadius: "20px", px: 3, py: 1 }}>
              Clear all filters
            </Button>
          )}
        </Box>
      ) : (
        <>
          <Grid container spacing={3}>
            {looks.map((look, index) => (
              <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={look.id}>
                <Card sx={{ 
                  height: "100%", 
                  borderRadius: "24px", 
                  bgcolor: "rgba(255, 255, 255, 0.4)", 
                  backdropFilter: "blur(20px)", 
                  boxShadow: "0 8px 32px rgba(160, 140, 130, 0.05)", 
                  border: "1px solid rgba(255,255,255,0.7)", 
                  transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                  animation: "fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both",
                  animationDelay: `${index * 0.05}s`,
                  "&:hover": { 
                    transform: "translateY(-8px) scale(1.01)", 
                    boxShadow: "0 20px 48px rgba(160, 140, 130, 0.15)",
                    borderColor: "rgba(255,255,255,0.9)",
                    bgcolor: "rgba(255, 255, 255, 0.7)",
                  },
                  "&:hover .look-image": {
                    transform: "scale(1.08)"
                  }
                }}>
                  <CardActionArea onClick={() => navigate(`/app/looks/${look.id}`)} sx={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "stretch" }}>
                    <Box sx={{ position: "relative", bgcolor: "transparent", aspectRatio: "3/4", overflow: "hidden", p: 1.5, pb: 0 }}>
                      <Box sx={{ width: "100%", height: "100%", borderRadius: "16px", overflow: "hidden", position: "relative", bgcolor: "#f5f0ef" }}>
                        {look.thumbnail ? (
                          <CardMedia
                            className="look-image"
                            component="img"
                            image={look.thumbnail}
                            alt={`${look.brand} ${look.season}`}
                            sx={{ 
                              width: "100%", 
                              height: "100%", 
                              objectFit: "cover", 
                              transition: "transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)", 
                            }}
                          />
                        ) : (
                          <Box sx={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "#fcfaf9" }}>
                            <AddPhotoAlternateIcon sx={{ fontSize: 48, color: "#e8dedd" }} />
                          </Box>
                        )}
                        {look.garment_count > 0 && (
                          <Chip
                            label={`${look.garment_count} GARMENT${look.garment_count !== 1 ? "S" : ""}`}
                            size="small"
                            sx={{
                              position: "absolute",
                              top: 12,
                              right: 12,
                              bgcolor: "rgba(255,255,255,0.9)",
                              color: "text.primary",
                              fontSize: 10,
                              fontWeight: 800,
                              letterSpacing: "0.1em",
                              backdropFilter: "blur(12px)",
                              border: "1px solid rgba(255,255,255,0.6)",
                              boxShadow: "0 4px 12px rgba(0,0,0,0.08)"
                            }}
                          />
                        )}
                      </Box>
                    </Box>
                    <CardContent sx={{ flex: 1, p: 2.5, "&:last-child": { pb: 2.5 } }}>
                      <Typography sx={{ fontWeight: 800, fontSize: 16, color: "text.primary", mb: 0.5, letterSpacing: "-0.01em" }} noWrap>
                        {look.name || look.brand}
                      </Typography>
                      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <Typography sx={{ fontSize: 12, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 700 }} noWrap>
                          {look.name ? look.brand : [look.season, look.year > 0 ? look.year : null].filter(Boolean).join(" ") || " "}
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: "#b0b0b0", fontWeight: 500 }}>
                          Look #{String(index + 1).padStart(2, '0')}
                        </Typography>
                      </Box>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
            {isFetchingNextPage &&
              Array.from({ length: 4 }).map((_, i) => (
                <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={`skeleton-${i}`}>
                  <Card sx={{ 
                    height: "100%", 
                    borderRadius: "24px", 
                    bgcolor: "rgba(255, 255, 255, 0.4)", 
                    backdropFilter: "blur(20px)", 
                    boxShadow: "0 8px 32px rgba(160, 140, 130, 0.05)", 
                    border: "1px solid rgba(255,255,255,0.7)", 
                    display: "flex", flexDirection: "column", alignItems: "stretch" 
                  }}>
                    <Box sx={{ position: "relative", bgcolor: "transparent", aspectRatio: "3/4", overflow: "hidden", p: 1.5, pb: 0 }}>
                      <Skeleton variant="rectangular" sx={{ width: "100%", height: "100%", borderRadius: "16px" }} animation="wave" />
                    </Box>
                    <CardContent sx={{ flex: 1, p: 2.5, "&:last-child": { pb: 2.5 } }}>
                      <Skeleton width="70%" height={24} animation="wave" sx={{ mb: 1, transform: "none" }} />
                      <Skeleton width="40%" height={16} animation="wave" sx={{ transform: "none" }} />
                    </CardContent>
                  </Card>
                </Grid>
              ))}
          </Grid>

          {hasNextPage && (
            <Box sx={{ textAlign: "center", mt: 6, mb: 4 }}>
              <Button
                variant="outlined"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                sx={{ 
                  borderRadius: "24px",
                  borderColor: "rgba(0,0,0,0.12)", 
                  color: "text.primary", 
                  fontWeight: 700,
                  fontSize: 12,
                  bgcolor: "#ffffff",
                  px: 5, 
                  py: 1.5, 
                  transition: "all 0.2s",
                  "&:hover": { 
                    borderColor: "text.primary", 
                    bgcolor: "rgba(0,0,0,0.02)",
                    transform: "translateY(-1px)",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.05)"
                  } 
                }}
              >
                {isFetchingNextPage ? "LOADING…" : `LOAD MORE CURATED LOOKS (${Math.max(0, total - looks.length).toLocaleString()} REMAINING)`}
              </Button>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
