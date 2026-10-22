import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  Box,
  Card,
  CardActionArea,
  CardMedia,
  CardContent,
  Typography,
  Chip,
  Button,
  Skeleton,
  Menu,
  MenuItem,
  Alert,
} from "@mui/material";
import AddPhotoAlternateIcon from "@mui/icons-material/AddPhotoAlternate";
import FilterListIcon from "@mui/icons-material/FilterList";
import StorefrontIcon from "@mui/icons-material/Storefront";
import SyncIcon from "@mui/icons-material/Sync";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import { PageHeader } from "../../components/PageHeader";
import { ShopifyConnectDialog, type ShopifyStatus } from "../../components/ShopifyConnectDialog";
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
  source_type: "retail" | "runway" | "shopify";
  is_private?: boolean;
  is_deconstructed?: boolean;
  deconstruction_status?: "pending" | "processing" | "done" | "failed" | null;
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
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();

  const storedRole = (() => {
    try {
      return JSON.parse(localStorage.getItem("fash_user") || "{}").role;
    } catch {
      return undefined;
    }
  })();
  const userRole = (user as unknown as { role?: string })?.role || storedRole;
  const isAdmin = userRole === "admin";
  const isRetail = userRole === "retail_chain";
  const defaultCategory: "runway" | "retail" = isRetail ? "retail" : "runway";

  const shopifyParam = searchParams.get("shopify");
  const shopParam = searchParams.get("shop");

  const [sourceCategory, setSourceCategory] = useState<"runway" | "retail" | "shopify">(() =>
    shopifyParam === "connected" ? "shopify" : defaultCategory
  );

  useEffect(() => {
    if (shopifyParam === "connected") return;
    if (isRetail && sourceCategory === "runway") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSourceCategory("retail");
    } else if (!isAdmin && !isRetail && sourceCategory === "retail") {
      setSourceCategory("runway");
    }
  }, [isRetail, isAdmin, sourceCategory, shopifyParam]);

  const [selectedBrand, setSelectedBrand] = useState<string[]>([]);
  const [selectedGarmentType, setSelectedGarmentType] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [shopifyDialogOpen, setShopifyDialogOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [sortAnchor, setSortAnchor] = useState<null | HTMLElement>(null);
  const [sort, setSort] = useState("latest");

  const q = searchParams.get("q") || "";

  const shopifyBanner =
    !bannerDismissed && shopifyParam === "connected"
      ? `Shopify store '${shopParam || "your store"}' connected successfully! Your catalogue is now linked.`
      : null;

  // Fetch live Shopify status
  const { data: shopifyStatus } = useQuery<ShopifyStatus>({
    queryKey: ["shopify-status"],
    queryFn: async () => {
      const { data } = await api.get("/shopify/status");
      return data;
    },
  });

  // Fetch available filter options
  const { data: filters } = useQuery<FiltersResponse>({
    queryKey: ["looks-filters", sourceCategory],
    queryFn: async () => {
      if (sourceCategory === "shopify") {
        return { brands: [], garment_types: [] };
      }
      const { data } = await api.get("/looks/filters", { params: { type: sourceCategory } });
      return data;
    },
  });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isFetching } =
    useInfiniteQuery<LooksResponse>({
      queryKey: ["looks", sourceCategory, selectedBrand, selectedGarmentType, q, sort],
      queryFn: async ({ pageParam }) => {
        const params: Record<string, string> = { limit: "24" };
        if (sourceCategory === "shopify") {
          params.type = "shopify";
          params.source = "shopify";
        } else {
          params.type = sourceCategory;
          params.is_deconstructed = "true";
        }
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
        eyebrow={
          sourceCategory === "shopify"
            ? "Private Tenant Catalogue"
            : sourceCategory === "retail"
            ? "Retail Trends"
            : "Runway Looks"
        }
        heading={sourceCategory === "shopify" ? "My Shopify Looks" : "Curated Looks"}
        description={
          sourceCategory === "shopify"
            ? "Private catalogue products imported from your connected Shopify store. Available for workspace concepts and AI deconstruction."
            : "Browse and deconstruct looks from your selected sources. Add elements to a workspace to start building your collection."
        }
      />

      {/* Shopify OAuth Success Banner */}
      {shopifyBanner && (
        <Alert
          severity="success"
          onClose={() => setBannerDismissed(true)}
          sx={{ mb: 3, borderRadius: "14px", fontSize: 13, boxShadow: "0 2px 12px rgba(46,125,50,0.1)" }}
        >
          {shopifyBanner}
        </Alert>
      )}

      {/* Catalogue Source Switcher Toggle */}
      <Box sx={{ mb: 3, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
        <Box
          sx={{
            display: "inline-flex",
            bgcolor: "#f5eee9",
            borderRadius: "24px",
            p: "4px",
            border: "1px solid #eaded8",
            gap: "2px",
          }}
        >
          {/* Runway tab: visible to Admins and Fashion Designers */}
          {(isAdmin || !isRetail) && (
            <Button
              size="small"
              onClick={() => {
                setSourceCategory("runway");
                clearFilters();
              }}
              sx={{
                borderRadius: "20px",
                px: 2.5,
                py: 0.6,
                fontSize: 13,
                fontWeight: 600,
                textTransform: "none",
                bgcolor: sourceCategory === "runway" ? "primary.main" : "transparent",
                color: sourceCategory === "runway" ? "#ffffff" : "text.secondary",
                boxShadow: sourceCategory === "runway" ? "0 2px 8px rgba(175, 44, 44, 0.25)" : "none",
                "&:hover": {
                  bgcolor: sourceCategory === "runway" ? "primary.main" : "rgba(0,0,0,0.04)",
                },
              }}
            >
              Runway Looks
            </Button>
          )}

          {/* Retail Trends tab: visible to Admins and Retail Chain users */}
          {(isAdmin || isRetail) && (
            <Button
              size="small"
              onClick={() => {
                setSourceCategory("retail");
                clearFilters();
              }}
              sx={{
                borderRadius: "20px",
                px: 2.5,
                py: 0.6,
                fontSize: 13,
                fontWeight: 600,
                textTransform: "none",
                bgcolor: sourceCategory === "retail" ? "primary.main" : "transparent",
                color: sourceCategory === "retail" ? "#ffffff" : "text.secondary",
                boxShadow: sourceCategory === "retail" ? "0 2px 8px rgba(175, 44, 44, 0.25)" : "none",
                "&:hover": {
                  bgcolor: sourceCategory === "retail" ? "primary.main" : "rgba(0,0,0,0.04)",
                },
              }}
            >
              Retail Trends
            </Button>
          )}

          <Button
            size="small"
            startIcon={<StorefrontIcon sx={{ fontSize: "16px !important" }} />}
            onClick={() => {
              setSourceCategory("shopify");
              clearFilters();
            }}
            sx={{
              borderRadius: "20px",
              px: 2.5,
              py: 0.6,
              fontSize: 13,
              fontWeight: 600,
              textTransform: "none",
              bgcolor: sourceCategory === "shopify" ? "#202223" : "transparent",
              color: sourceCategory === "shopify" ? "#ffffff" : "text.secondary",
              boxShadow: sourceCategory === "shopify" ? "0 2px 8px rgba(32, 34, 35, 0.3)" : "none",
              "&:hover": {
                bgcolor: sourceCategory === "shopify" ? "#202223" : "rgba(0,0,0,0.04)",
              },
            }}
          >
            My Shopify Looks
          </Button>
        </Box>

        {/* Live Shopify Store Connection Status Button */}
        <Button
          size="small"
          startIcon={<StorefrontIcon sx={{ fontSize: 16 }} />}
          onClick={() => setShopifyDialogOpen(true)}
          sx={{
            borderRadius: "20px",
            px: 2,
            py: 0.7,
            fontSize: 12,
            fontWeight: 600,
            textTransform: "none",
            bgcolor: shopifyStatus?.connected ? "rgba(149, 191, 71, 0.12)" : "rgba(0,0,0,0.04)",
            color: shopifyStatus?.connected ? "#2c6ecb" : "text.secondary",
            border: "1px solid",
            borderColor: shopifyStatus?.connected ? "rgba(149, 191, 71, 0.4)" : "rgba(0,0,0,0.08)",
            "&:hover": {
              bgcolor: shopifyStatus?.connected ? "rgba(149, 191, 71, 0.2)" : "rgba(0,0,0,0.08)",
            },
          }}
        >
          {shopifyStatus?.connected
            ? `Shopify: ${shopifyStatus.shop_domain || "Connected"}`
            : "Connect Shopify Store"}
        </Button>
      </Box>

      {/* Top Action Bar */}
      <Box sx={{ mb: filtersOpen ? 2 : 4 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2 }}>
          {/* Left side: Filters + Total Looks */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            {sourceCategory !== "shopify" && (
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
                  },
                }}
              >
                Filters {hasFilters && `(${selectedBrand.length + selectedGarmentType.length})`}
              </Button>
            )}

            {hasFilters && (
              <Button
                size="small"
                onClick={clearFilters}
                sx={{
                  color: "text.secondary",
                  fontSize: 12,
                  fontWeight: 500,
                  textDecoration: "underline",
                  "&:hover": { color: "primary.main" },
                }}
              >
                Clear all
              </Button>
            )}

            <Typography sx={{ color: "text.secondary", fontSize: 13, ml: 1, fontWeight: 500 }}>
              {isLoading ? "Loading looks..." : `${total.toLocaleString()} looks available`}
            </Typography>
          </Box>

          {/* Right side: Sort */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Button
              size="small"
              onClick={(e) => setSortAnchor(e.currentTarget)}
              sx={{
                color: "text.secondary",
                fontSize: 13,
                fontWeight: 500,
                borderRadius: "20px",
                px: 2,
                py: 0.75,
                bgcolor: "rgba(255, 255, 255, 0.6)",
                border: "1px solid rgba(0,0,0,0.06)",
                "&:hover": { bgcolor: "#fff0ef", color: "primary.main" },
              }}
            >
              Sort: {sort === "latest" ? "Latest First" : sort === "oldest" ? "Oldest First" : "Brand (A-Z)"}
            </Button>
            <Menu
              anchorEl={sortAnchor}
              open={Boolean(sortAnchor)}
              onClose={() => setSortAnchor(null)}
              PaperProps={{ sx: { borderRadius: "16px", mt: 1, boxShadow: "0 4px 20px rgba(0,0,0,0.08)" } }}
            >
              <MenuItem
                selected={sort === "latest"}
                onClick={() => {
                  setSort("latest");
                  setSortAnchor(null);
                }}
              >
                Latest First
              </MenuItem>
              <MenuItem
                selected={sort === "oldest"}
                onClick={() => {
                  setSort("oldest");
                  setSortAnchor(null);
                }}
              >
                Oldest First
              </MenuItem>
              <MenuItem
                selected={sort === "brand"}
                onClick={() => {
                  setSort("brand");
                  setSortAnchor(null);
                }}
              >
                Brand (A-Z)
              </MenuItem>
            </Menu>
          </Box>
        </Box>
      </Box>

      {/* Filters Drawer / Panel */}
      {filtersOpen && sourceCategory !== "shopify" && (
        <Box
          sx={{
            mb: 4,
            p: 3,
            borderRadius: "20px",
            bgcolor: "rgba(255, 255, 255, 0.6)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(0,0,0,0.06)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.02)",
          }}
        >
          {/* Brand filter */}
          {filters?.brands && filters.brands.length > 0 && (
            <Box sx={{ mb: 2.5 }}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "text.secondary", mb: 1.5 }}>
                Brand
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {filters.brands.map((b) => (
                  <Chip
                    key={b}
                    label={b}
                    size="small"
                    clickable
                    onClick={() =>
                      setSelectedBrand((prev) =>
                        prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]
                      )
                    }
                    sx={{
                      fontSize: 12,
                      height: 30,
                      borderRadius: "15px",
                      bgcolor: selectedBrand.includes(b) ? "#fff0ef" : "#ffffff",
                      color: selectedBrand.includes(b) ? "primary.main" : "text.primary",
                      border: "1px solid",
                      borderColor: selectedBrand.includes(b) ? "primary.main" : "rgba(0,0,0,0.12)",
                      fontWeight: selectedBrand.includes(b) ? 600 : 500,
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
                    onClick={() =>
                      setSelectedGarmentType((prev) =>
                        prev.includes(gt) ? prev.filter((x) => x !== gt) : [...prev, gt]
                      )
                    }
                    sx={{
                      fontSize: 12,
                      height: 30,
                      borderRadius: "15px",
                      bgcolor: selectedGarmentType.includes(gt) ? "primary.main" : "#ffffff",
                      color: selectedGarmentType.includes(gt) ? "#fff" : "text.primary",
                      border: "1px solid",
                      borderColor: selectedGarmentType.includes(gt) ? "primary.main" : "rgba(0,0,0,0.12)",
                      fontWeight: selectedGarmentType.includes(gt) ? 600 : 500,
                    }}
                  />
                ))}
              </Box>
            </Box>
          )}
        </Box>
      )}

      {/* Main Grid & Empty States */}
      {isLoading || (isFetching && !isFetchingNextPage) ? (
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 3 }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <Box key={i}>
              <Card
                sx={{
                  height: "100%",
                  borderRadius: "24px",
                  bgcolor: "rgba(255, 255, 255, 0.4)",
                  backdropFilter: "blur(20px)",
                  boxShadow: "0 8px 32px rgba(160, 140, 130, 0.05)",
                  border: "1px solid rgba(255,255,255,0.7)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "stretch",
                }}
              >
                <Box sx={{ position: "relative", bgcolor: "transparent", aspectRatio: "3/4", overflow: "hidden", p: 1.5, pb: 0 }}>
                  <Skeleton variant="rectangular" sx={{ width: "100%", height: "100%", borderRadius: "16px" }} animation="wave" />
                </Box>
                <CardContent sx={{ flex: 1, p: 2.5, "&:last-child": { pb: 2.5 } }}>
                  <Skeleton width="70%" height={24} animation="wave" sx={{ mb: 1, transform: "none" }} />
                  <Skeleton width="40%" height={16} animation="wave" sx={{ transform: "none" }} />
                </CardContent>
              </Card>
            </Box>
          ))}
        </Box>
      ) : looks.length === 0 ? (
        sourceCategory === "shopify" ? (
          <Box
            sx={{
              textAlign: "center",
              py: 10,
              px: 3,
              bgcolor: "rgba(255,255,255,0.6)",
              borderRadius: "24px",
              border: "1px dashed rgba(32, 34, 35, 0.2)",
            }}
          >
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                bgcolor: "rgba(149, 191, 71, 0.15)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                mb: 2,
              }}
            >
              <StorefrontIcon sx={{ fontSize: 32, color: "#95bf47" }} />
            </Box>
            <Typography sx={{ fontFamily: "'Literata', Georgia, serif", fontSize: 22, fontWeight: 700, mb: 1 }}>
              {shopifyStatus?.connected
                ? "Your Shopify Catalogue is Empty"
                : "Connect Your Shopify Store"}
            </Typography>
            <Typography sx={{ color: "text.secondary", fontSize: 14, maxWidth: 460, mx: "auto", mb: 3, lineHeight: 1.6 }}>
              {shopifyStatus?.connected
                ? `Store '${shopifyStatus.shop_domain}' is connected, but no product looks have been imported yet. Sync your catalogue to import products.`
                : "Connect your Shopify brand store via OAuth to automatically sync products into your private tenant catalogue for inspiration and workspace moodboards."}
            </Typography>
            <Button
              variant="contained"
              startIcon={shopifyStatus?.connected ? <SyncIcon /> : <StorefrontIcon />}
              onClick={() => setShopifyDialogOpen(true)}
              sx={{
                borderRadius: "20px",
                px: 3.5,
                py: 1,
                bgcolor: "#202223",
                color: "#ffffff",
                fontWeight: 600,
                textTransform: "none",
                "&:hover": { bgcolor: "#000000" },
              }}
            >
              {shopifyStatus?.connected ? "Sync Products Now" : "Connect Shopify Store"}
            </Button>
          </Box>
        ) : (
          <Box
            sx={{
              textAlign: "center",
              py: 12,
              px: 3,
              bgcolor: "rgba(255,255,255,0.5)",
              borderRadius: "24px",
              border: "1px dashed rgba(0,0,0,0.1)",
            }}
          >
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
        )
      ) : (
        <>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 3 }}>
            {looks.map((look, index) => (
              <Box key={look.id}>
                <Card
                  sx={{
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
                      transform: "scale(1.08)",
                    },
                  }}
                >
                  <CardActionArea
                    onClick={() => navigate(`/app/looks/${look.id}`)}
                    sx={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "stretch" }}
                  >
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

                        {/* Top Left: Shopify Origin Chip */}
                        {look.source_type === "shopify" && (
                          <Chip
                            icon={<StorefrontIcon sx={{ fontSize: "14px !important", color: "#95bf47 !important" }} />}
                            label="Shopify"
                            size="small"
                            sx={{
                              position: "absolute",
                              top: 12,
                              left: 12,
                              bgcolor: "rgba(32, 34, 35, 0.88)",
                              color: "#ffffff",
                              fontSize: 10,
                              fontWeight: 800,
                              letterSpacing: "0.08em",
                              backdropFilter: "blur(12px)",
                              border: "1px solid rgba(149, 191, 71, 0.4)",
                              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                              height: 24,
                            }}
                          />
                        )}

                        {/* Top Right: Garment / Variant Count */}
                        {look.garment_count > 0 && (
                          <Chip
                            label={`${look.garment_count} ${look.source_type === "shopify" ? "VARIANT" : "GARMENT"}${look.garment_count !== 1 ? "S" : ""}`}
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
                              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                            }}
                          />
                        )}
                      </Box>
                    </Box>

                    <CardContent sx={{ flex: 1, p: 2.5, "&:last-child": { pb: 2.5 } }}>
                      <Typography sx={{ fontWeight: 800, fontSize: 16, color: "text.primary", mb: 0.5, letterSpacing: "-0.01em" }} noWrap>
                        {look.name || look.brand}
                      </Typography>
                      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                        <Typography sx={{ fontSize: 12, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 700 }} noWrap>
                          {look.brand}
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: "#b0b0b0", fontWeight: 500 }}>
                          #{String(index + 1).padStart(2, "0")}
                        </Typography>
                      </Box>

                      {/* Deconstruction Lifecycle Status Badge */}
                      {look.deconstruction_status === "pending" ? (
                        <Chip
                          icon={<HourglassEmptyIcon sx={{ fontSize: "12px !important", color: "#d46b08 !important" }} />}
                          label="Pending Deconstruction"
                          size="small"
                          sx={{
                            bgcolor: "#fff7e6",
                            color: "#d46b08",
                            border: "1px solid #ffd591",
                            fontWeight: 700,
                            fontSize: 10,
                            height: 20,
                            mt: 0.5,
                          }}
                        />
                      ) : look.is_deconstructed ? (
                        <Chip
                          label="Deconstructed"
                          size="small"
                          sx={{
                            bgcolor: "#f6ffed",
                            color: "#389e0d",
                            border: "1px solid #b7eb8f",
                            fontWeight: 700,
                            fontSize: 10,
                            height: 20,
                            mt: 0.5,
                          }}
                        />
                      ) : null}
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Box>
            ))}
          </Box>

          {hasNextPage && (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 6 }}>
              <Button
                variant="outlined"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                sx={{
                  borderRadius: "20px",
                  px: 4,
                  py: 1,
                  fontSize: 14,
                  fontWeight: 600,
                  textTransform: "none",
                  borderColor: "rgba(0,0,0,0.12)",
                }}
              >
                {isFetchingNextPage ? "Loading more..." : "Load more looks"}
              </Button>
            </Box>
          )}
        </>
      )}

      {/* Shopify Connection & Sync Dialog */}
      <ShopifyConnectDialog
        open={shopifyDialogOpen}
        onClose={() => setShopifyDialogOpen(false)}
        onSyncComplete={() => {
          qc.invalidateQueries({ queryKey: ["looks"] });
          setSourceCategory("shopify");
        }}
      />
    </Box>
  );
}
