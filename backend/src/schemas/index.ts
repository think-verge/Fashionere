import { OpenAPIRegistry, extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

// ── Common ────────────────────────────────────────────────────────────────────

const UserSchema = registry.register(
  "User",
  z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string(),
  }),
);

const AuthCredentialsSchema = registry.register(
  "AuthCredentials",
  z.object({
    email: z.string().email(),
    password: z.string().min(6),
  }),
);

const SignupRequestSchema = registry.register(
  "SignupRequest",
  z.object({
    email: z.string().email(),
    password: z.string().min(6),
    name: z.string().min(1),
  }),
);

const ProjectSchema = registry.register(
  "Project",
  z.object({
    _id: z.string(),
    userId: z.string(),
    name: z.string(),
    description: z.string(),
    tags: z.array(z.string()),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  }),
);

// ── Looks (Deconstruction Engine) ───────────────────────────────────────────

const LookSummarySchema = registry.register(
  "LookSummary",
  z.object({
    look_id: z.string(),
    brand: z.string().nullable(),
    collection_id: z.string().nullable(),
    runway_url: z.string().nullable(),
    num_garments: z.number(),
    has_flats: z.boolean(),
  }),
);

const ColorSwatchSchema = registry.register(
  "ColorSwatch",
  z.object({
    name: z.string().optional(),
    pantone: z.string().optional(),
    hex: z.string().optional(),
    role: z.string().optional(),
  }),
);

const FabricElementSchema = registry.register(
  "FabricElement",
  z.object({
    name: z.string().optional(),
    material: z.string().optional(),
    weight: z.string().optional(),
    finish: z.string().optional(),
    description: z.string().optional(),
    confidence: z.string().optional(),
    swatch_url: z.string().optional(),
  }),
);

const PatternElementSchema = registry.register(
  "PatternElement",
  z.object({
    name: z.string().optional(),
    motif: z.string().optional(),
    type: z.string().optional(),
    scale: z.string().optional(),
    colors: z.array(z.string()).optional(),
    description: z.string().optional(),
    swatch_url: z.string().optional(),
  }),
);

const GarmentSchema = registry.register(
  "Garment",
  z.object({
    garment_id: z.string().nullable(),
    piece: z.string().nullable(),
    colors: z.array(ColorSwatchSchema),
    flat: z.string().nullable(),
    fabrics: z.array(FabricElementSchema),
    patterns: z.array(PatternElementSchema),
  }),
);

const LookDetailSchema = registry.register(
  "LookDetail",
  z.object({
    look_id: z.string(),
    brand: z.string().nullable(),
    collection_id: z.string().nullable(),
    runway_url: z.string().nullable(),
    silhouette: z.string().nullable(),
    whole_look_flat: z.string().nullable(),
    garments: z.array(GarmentSchema),
    status: z.string().nullable(),
  }),
);

// ── Trends (Trend Analysis Engine) ──────────────────────────────────────────

const TrendSheetSummarySchema = registry.register(
  "TrendSheetSummary",
  z.object({
    brand: z.string(),
    brand_slug: z.string(),
    window_years: z.array(z.number()),
    total_looks: z.number(),
  }),
);

const MomentumInfoSchema = registry.register(
  "MomentumInfo",
  z.object({
    yoy_delta: z.number().nullable(),
    kind: z.string(),
    trustworthy: z.boolean(),
    by_year: z.record(z.number()),
    like_season: z.record(z.number()),
  }),
);

const EvidenceRefSchema = registry.register(
  "EvidenceRef",
  z.object({
    collection_id: z.string(),
    look_number: z.number(),
    hex: z.string().nullable().optional(),
    image: z.string().nullable().optional(),
  }),
);

const RankedValueSchema = registry.register(
  "RankedValue",
  z.object({
    value: z.string(),
    share: z.number(),
    looks: z.number(),
    signature_score: z.number().nullable().optional(),
    momentum: MomentumInfoSchema.nullable().optional(),
    evidence: z.array(EvidenceRefSchema),
  }),
);

const PaletteSwatchSchema = registry.register(
  "PaletteSwatch",
  z.object({
    hex: z.string(),
    family: z.string(),
    share: z.number(),
    pantone: z.string().nullable().optional(),
  }),
);

const DimensionAggregateSchema = registry.register(
  "DimensionAggregate",
  z.object({
    dimension: z.string(),
    total_looks: z.number(),
    by_year: z.record(z.number()),
    ranked: z.array(RankedValueSchema),
    palette: z.array(PaletteSwatchSchema),
    omitted_count: z.number(),
  }),
);

const TrendSheetSchema = registry.register(
  "TrendSheet",
  z.object({
    brand: z.string(),
    brand_slug: z.string(),
    report_type: z.string(),
    window_years: z.array(z.number()),
    collections: z.number(),
    total_looks: z.number(),
    dimensions: z.record(DimensionAggregateSchema),
    generated: z.record(z.unknown()),
  }),
);

const CostInputSchema = registry.register(
  "CostInput",
  z.object({
    category: z.string(),
    quantity: z.number().int().min(1),
    fabricType: z.string(),
    complexity: z.enum(["simple", "moderate", "complex"]),
    market: z.enum(["budget", "mid", "premium", "luxury"]),
  }),
);

const CostEstimateSchema = registry.register(
  "CostEstimate",
  z.object({
    fabricCostPerUnit: z.number(),
    laborCostPerUnit: z.number(),
    overheadPerUnit: z.number(),
    totalPerUnit: z.number(),
    totalForQuantity: z.number(),
    currency: z.string(),
    breakdown: z.object({
      fabric: z.number(),
      labor: z.number(),
      overhead: z.number(),
      packaging: z.number(),
    }),
  }),
);

// ── Path registrations ────────────────────────────────────────────────────────

export function registerPaths() {
  // Auth
  registry.registerPath({
    method: "post", path: "/api/v1/auth/signup", tags: ["Auth"],
    request: { body: { content: { "application/json": { schema: SignupRequestSchema } } } },
    responses: { 201: { description: "Created", content: { "application/json": { schema: UserSchema } } } },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/auth/login", tags: ["Auth"],
    request: { body: { content: { "application/json": { schema: AuthCredentialsSchema } } } },
    responses: { 200: { description: "OK", content: { "application/json": { schema: UserSchema } } } },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/auth/logout", tags: ["Auth"],
    responses: { 200: { description: "OK" } },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/auth/me", tags: ["Auth"],
    responses: { 200: { description: "OK", content: { "application/json": { schema: UserSchema } } } },
  });

  // Users
  registry.registerPath({
    method: "patch", path: "/api/v1/users/me", tags: ["Users"],
    request: { body: { content: { "application/json": { schema: z.object({ name: z.string() }) } } } },
    responses: { 200: { description: "OK", content: { "application/json": { schema: UserSchema } } } },
  });

  // Looks (Deconstruction Engine)
  registry.registerPath({
    method: "get", path: "/api/v1/looks", tags: ["Looks"],
    request: { query: z.object({ brand: z.string().optional() }) },
    responses: { 200: { description: "OK", content: { "application/json": { schema: z.array(LookSummarySchema) } } } },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/looks/{lookId}", tags: ["Looks"],
    request: { params: z.object({ lookId: z.string() }) },
    responses: { 200: { description: "OK", content: { "application/json": { schema: LookDetailSchema } } } },
  });

  // Trends (Trend Analysis Engine)
  registry.registerPath({
    method: "get", path: "/api/v1/trends", tags: ["Trends"],
    responses: { 200: { description: "OK", content: { "application/json": { schema: z.array(TrendSheetSummarySchema) } } } },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/trends/{brandSlug}", tags: ["Trends"],
    request: { params: z.object({ brandSlug: z.string() }) },
    responses: { 200: { description: "OK", content: { "application/json": { schema: TrendSheetSchema } } } },
  });

  // Projects
  registry.registerPath({
    method: "get", path: "/api/v1/projects", tags: ["Projects"],
    responses: { 200: { description: "OK", content: { "application/json": { schema: z.array(ProjectSchema) } } } },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/projects", tags: ["Projects"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({ name: z.string(), description: z.string().optional(), tags: z.array(z.string()).optional() }),
          },
        },
      },
    },
    responses: { 201: { description: "Created", content: { "application/json": { schema: ProjectSchema } } } },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/projects/{id}", tags: ["Projects"],
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: { description: "OK", content: { "application/json": { schema: ProjectSchema } } } },
  });
  registry.registerPath({
    method: "patch", path: "/api/v1/projects/{id}", tags: ["Projects"],
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { "application/json": { schema: z.object({ name: z.string().optional(), description: z.string().optional(), tags: z.array(z.string()).optional() }) } } },
    },
    responses: { 200: { description: "OK", content: { "application/json": { schema: ProjectSchema } } } },
  });
  registry.registerPath({
    method: "delete", path: "/api/v1/projects/{id}", tags: ["Projects"],
    request: { params: z.object({ id: z.string() }) },
    responses: { 204: { description: "No Content" } },
  });

  // Cost
  registry.registerPath({
    method: "post", path: "/api/v1/cost/estimate", tags: ["Cost"],
    request: { body: { content: { "application/json": { schema: CostInputSchema } } } },
    responses: { 200: { description: "OK", content: { "application/json": { schema: CostEstimateSchema } } } },
  });
}
