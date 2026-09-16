import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import {
  Box, Grid, Card, CardActionArea, CardMedia, CardContent,
  Typography, Chip, Button, Skeleton,
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

  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [selectedGarmentType, setSelectedGarmentType] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Fetch available filter options
  const { data: filters } = useQuery<FiltersResponse>({
    queryKey: ["looks-filters", type],
    queryFn: async () => {
      const { data } = await api.get("/looks/filters", { params: { type } });
      return data;
    },
  });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery<LooksResponse>({
      queryKey: ["looks", type, selectedBrand, selectedGarmentType],
      queryFn: async ({ pageParam }) => {
        const params: Record<string, string> = { type, limit: "24" };
        if (type === "retail") params.deconstructed_only = "true";
        if (pageParam) params.cursor = pageParam as string;
        if (selectedBrand) params.brand = selectedBrand;
        if (selectedGarmentType) params.garment_type = selectedGarmentType;
        const { data } = await api.get("/looks", { params });
        return data;
      },
      getNextPageParam: (last) => last.next_cursor ?? undefined,
      initialPageParam: undefined,
    });

  const looks = data?.pages.flatMap((p) => p.looks) ?? [];
  const total = data?.pages[0]?.total ?? 0;
  const hasFilters = !!(selectedBrand || selectedGarmentType);

  function clearFilters() {
    setSelectedBrand(null);
    setSelectedGarmentType(null);
  }

  return (
    <Box>
      <PageHeader
        eyebrow={type === "retail" ? "Retail Looks" : "Runway Looks"}
        heading="Curated Looks"
        description="Browse and deconstruct looks from your selected sources. Add elements to a workspace to start building your collection."
      />

      {/* Filter bar */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2, flexWrap: "wrap" }}>
          <Button
            variant="text"
            size="small"
            startIcon={<FilterListIcon fontSize="small" />}
            onClick={() => setFiltersOpen((v) => !v)}
            sx={{
              color: filtersOpen || hasFilters ? "primary.main" : "text.secondary",
              fontWeight: hasFilters ? 700 : 500,
              fontSize: 13,
              borderRadius: "8px",
              px: 1.5,
              py: 0.5,
              bgcolor: hasFilters ? "#fff0ef" : "transparent",
              "&:hover": { bgcolor: "#fff0ef", color: "primary.main" },
            }}
          >
            Filters {hasFilters ? `(${(selectedBrand ? 1 : 0) + (selectedGarmentType ? 1 : 0)})` : ""}
          </Button>

          {/* Active filter chips */}
          {selectedBrand && (
            <Chip
              label={selectedBrand}
              size="small"
              onDelete={() => setSelectedBrand(null)}
              sx={{ bgcolor: "#fff0ef", color: "primary.main", fontWeight: 600, fontSize: 12, height: 26 }}
            />
          )}
          {selectedGarmentType && (
            <Chip
              label={selectedGarmentType}
              size="small"
              onDelete={() => setSelectedGarmentType(null)}
              sx={{ bgcolor: "#e8f4fe", color: "info.main", fontWeight: 600, fontSize: 12, height: 26 }}
            />
          )}
          {hasFilters && (
            <Button
              size="small"
              onClick={clearFilters}
              sx={{ fontSize: 12, color: "text.disabled", px: 1, py: 0.25, minWidth: 0, "&:hover": { color: "text.secondary" } }}
            >
              Clear all
            </Button>
          )}
        </Box>

        {filtersOpen && (
          <Box
            sx={{
              p: 2.5,
              border: "1px solid #f0e4e2",
              borderRadius: "12px",
              bgcolor: "#faf8f7",
              display: "flex",
              flexDirection: "column",
              gap: 2.5,
            }}
          >
            {/* Brand filter */}
            {filters?.brands && filters.brands.length > 0 && (
              <Box>
                <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "text.secondary", mb: 1.5 }}>
                  Brand
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                  {filters.brands.slice(0, 30).map((brand) => (
                    <Chip
                      key={brand}
                      label={brand}
                      size="small"
                      clickable
                      onClick={() => setSelectedBrand(selectedBrand === brand ? null : brand)}
                      sx={{
                        fontSize: 12,
                        height: 28,
                        borderRadius: "6px",
                        bgcolor: selectedBrand === brand ? "primary.main" : "#fff",
                        color: selectedBrand === brand ? "#fff" : "text.primary",
                        border: "1px solid",
                        borderColor: selectedBrand === brand ? "primary.main" : "#e8dedd",
                        fontWeight: selectedBrand === brand ? 700 : 400,
                        "&:hover": {
                          bgcolor: selectedBrand === brand ? "primary.dark" : "#fff0ef",
                          borderColor: "primary.main",
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
                <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "text.secondary", mb: 1.5 }}>
                  Garment Type
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                  {filters.garment_types.map((gt) => (
                    <Chip
                      key={gt}
                      label={gt}
                      size="small"
                      clickable
                      onClick={() => setSelectedGarmentType(selectedGarmentType === gt ? null : gt)}
                      sx={{
                        fontSize: 12,
                        height: 28,
                        borderRadius: "6px",
                        bgcolor: selectedGarmentType === gt ? "#1a76d2" : "#fff",
                        color: selectedGarmentType === gt ? "#fff" : "text.primary",
                        border: "1px solid",
                        borderColor: selectedGarmentType === gt ? "#1a76d2" : "#e8dedd",
                        fontWeight: selectedGarmentType === gt ? 700 : 400,
                        "&:hover": {
                          bgcolor: selectedGarmentType === gt ? "#1565c0" : "#e8f4fe",
                          borderColor: "#1a76d2",
                        },
                      }}
                    />
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        )}
      </Box>

      {isLoading ? (
        <Grid container spacing={2.5}>
          {Array.from({ length: 12 }).map((_, i) => (
            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={i}>
              <Card>
                <Skeleton variant="rectangular" height={280} />
                <CardContent>
                  <Skeleton width="60%" />
                  <Skeleton width="40%" />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : looks.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 12 }}>
          <Typography sx={{ color: "text.secondary", fontFamily: "'Literata', Georgia, serif", fontSize: 18 }}>
            {hasFilters ? "No looks match the selected filters." : "No looks found. Try adjusting your source preferences."}
          </Typography>
          {hasFilters && (
            <Button onClick={clearFilters} variant="outlined" sx={{ mt: 2, borderColor: "#f0e4e2", color: "text.secondary", borderRadius: "10px" }}>
              Clear filters
            </Button>
          )}
        </Box>
      ) : (
        <>
          <Typography sx={{ mb: 3, color: "text.secondary", fontSize: 13 }}>
            {total} look{total !== 1 ? "s" : ""}
            {hasFilters && " matching filters"}
          </Typography>
          <Grid container spacing={2.5}>
            {looks.map((look) => (
              <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={look.id}>
                <Card sx={{ height: "100%" }}>
                  <CardActionArea onClick={() => navigate(`/app/looks/${look.id}`)} sx={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "stretch" }}>
                    <Box sx={{ position: "relative", bgcolor: "#f5f0ef", aspectRatio: "3/4", overflow: "hidden" }}>
                      {look.thumbnail ? (
                        <CardMedia
                          component="img"
                          image={look.thumbnail}
                          alt={`${look.brand} ${look.season}`}
                          sx={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.3s ease", "&:hover": { transform: "scale(1.03)" } }}
                        />
                      ) : (
                        <Box sx={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <AddPhotoAlternateIcon sx={{ fontSize: 40, color: "#dfbfbc" }} />
                        </Box>
                      )}
                      {look.garment_count > 0 && (
                        <Chip
                          label={`${look.garment_count} garment${look.garment_count !== 1 ? "s" : ""}`}
                          size="small"
                          sx={{
                            position: "absolute",
                            top: 10,
                            right: 10,
                            bgcolor: "rgba(255,255,255,0.92)",
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: "0.05em",
                            backdropFilter: "blur(4px)",
                          }}
                        />
                      )}
                    </Box>
                    <CardContent sx={{ flex: 1, pb: "16px !important" }}>
                      <Typography sx={{ fontWeight: 700, fontSize: 14, color: "text.primary", mb: 0.25 }} noWrap>
                        {look.name || look.brand}
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.08em" }} noWrap>
                        {look.name ? look.brand : [look.season, look.year > 0 ? look.year : null].filter(Boolean).join(" ") || " "}
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>

          {hasNextPage && (
            <Box sx={{ textAlign: "center", mt: 6 }}>
              <Button
                variant="outlined"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                sx={{ borderColor: "#f0e4e2", color: "text.secondary", px: 5, py: 1.5, "&:hover": { borderColor: "#dfbfbc", bgcolor: "#fff0ef" } }}
              >
                {isFetchingNextPage ? "Loading…" : "Load More"}
              </Button>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
