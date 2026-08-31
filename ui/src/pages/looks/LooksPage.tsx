import { useNavigate } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  Box, Grid, Card, CardActionArea, CardMedia, CardContent,
  Typography, Chip, Button, Skeleton,
} from "@mui/material";
import AddPhotoAlternateIcon from "@mui/icons-material/AddPhotoAlternate";
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

export default function LooksPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const type = user?.role === "retail_chain" ? "retail" : "runway";

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery<LooksResponse>({
      queryKey: ["looks", type],
      queryFn: async ({ pageParam }) => {
        const params: Record<string, string> = { type, limit: "24" };
        if (pageParam) params.cursor = pageParam as string;
        const { data } = await api.get("/looks", { params });
        return data;
      },
      getNextPageParam: (last) => last.next_cursor ?? undefined,
      initialPageParam: undefined,
    });

  const looks = data?.pages.flatMap((p) => p.looks) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  return (
    <Box>
      <PageHeader
        eyebrow={type === "retail" ? "Retail Looks" : "Runway Looks"}
        heading="Curated Looks"
        description="Browse and deconstruct looks from your selected sources. Add elements to a workspace to start building your collection."
      />

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
            No looks found. Try adjusting your source preferences.
          </Typography>
        </Box>
      ) : (
        <>
          <Typography sx={{ mb: 3, color: "text.secondary", fontSize: 13 }}>
            {total} looks
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
