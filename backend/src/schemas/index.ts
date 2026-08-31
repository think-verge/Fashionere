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
    role: z.enum(["designer", "retail_chain"]).optional(),
    sources: z.array(z.string()).optional(),
    garment_interests: z.array(z.string()).optional(),
  }),
);

// ── Looks ────────────────────────────────────────────────────────────────────

const LookSummarySchema = registry.register(
  "LookSummary",
  z.object({
    id: z.string(),
    brand: z.string(),
    season: z.string(),
    year: z.number(),
    source_type: z.enum(["retail", "runway"]),
    thumbnail: z.string().url().optional(),
    garment_count: z.number().int(),
    is_deconstructed: z.boolean(),
  }),
);

const GarmentElementSchema = registry.register(
  "GarmentElement",
  z.object({
    id: z.string(),
    look_id: z.string(),
    piece: z.string(),
    garment_type: z.string(),
    bbox: z.record(z.unknown()).nullable(),
    colors: z.array(z.record(z.unknown())),
    fabric: z.record(z.unknown()),
    pattern: z.string().nullable(),
    materials_candidates: z.array(z.string()),
  }),
);

const LookSchema = registry.register(
  "Look",
  z.object({
    id: z.string(),
    brand: z.string(),
    season: z.string(),
    year: z.number(),
    source_type: z.enum(["retail", "runway"]),
    images: z.array(z.record(z.unknown())),
    tags: z.array(z.record(z.unknown())),
    is_deconstructed: z.boolean(),
    garments: z.array(GarmentElementSchema),
  }),
);

const LookListResponseSchema = registry.register(
  "LookListResponse",
  z.object({
    looks: z.array(LookSummarySchema),
    total: z.number().int(),
    next_cursor: z.string().optional(),
  }),
);

// ── Workspace ─────────────────────────────────────────────────────────────────

const WorkspaceElementSchema = registry.register(
  "WorkspaceElement",
  z.object({
    element_id: z.string(),
    look_id: z.string(),
    garment_id: z.string(),
    garment_type: z.string(),
    element_type: z.enum(["color", "fabric", "pattern", "silhouette"]),
    data: z.record(z.unknown()),
    source_brand: z.string(),
    canvas_position: z.object({ x: z.number(), y: z.number() }),
    row: z.string(),
  }),
);

const WorkspaceSchema = registry.register(
  "Workspace",
  z.object({
    _id: z.string(),
    name: z.string(),
    project_id: z.string(),
    user_id: z.string(),
    status: z.enum(["draft", "ready", "generating"]),
    elements: z.array(WorkspaceElementSchema),
    canvas_meta: z.record(z.unknown()),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  }),
);

const MoodboardStatusEnum = z.enum(["pending", "running", "done", "error"]);
const InputModeEnum = z.enum(["query", "catalogue", "image"]);

const MoodboardSchema = registry.register(
  "Moodboard",
  z.object({
    _id: z.string(),
    userId: z.string(),
    jobId: z.string(),
    status: MoodboardStatusEnum,
    inputMode: InputModeEnum,
    inputPayload: z.record(z.unknown()),
    moodboard: z.record(z.unknown()).nullable(),
    name: z.string(),
    error: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  }),
);

const MoodboardSummarySchema = registry.register(
  "MoodboardSummary",
  z.object({
    _id: z.string(),
    userId: z.string(),
    jobId: z.string(),
    status: MoodboardStatusEnum,
    inputMode: InputModeEnum,
    name: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  }),
);

const ProjectSchema = registry.register(
  "Project",
  z.object({
    _id: z.string(),
    userId: z.string(),
    name: z.string(),
    description: z.string(),
    moodboardIds: z.array(z.string()),
    tags: z.array(z.string()),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
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

  // Moodboards
  registry.registerPath({
    method: "get", path: "/api/v1/moodboards", tags: ["Moodboards"],
    responses: { 200: { description: "OK", content: { "application/json": { schema: z.array(MoodboardSummarySchema) } } } },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/moodboards/from-query", tags: ["Moodboards"],
    request: { body: { content: { "application/json": { schema: z.object({ query: z.string() }) } } } },
    responses: { 202: { description: "Accepted", content: { "application/json": { schema: MoodboardSchema } } } },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/moodboards/from-catalogue", tags: ["Moodboards"],
    request: { body: { content: { "application/json": { schema: z.object({ catalogue_item_id: z.string() }) } } } },
    responses: { 202: { description: "Accepted", content: { "application/json": { schema: MoodboardSchema } } } },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/moodboards/from-image", tags: ["Moodboards"],
    request: { body: { content: { "application/json": { schema: z.object({ image_url: z.string().url() }) } } } },
    responses: { 202: { description: "Accepted", content: { "application/json": { schema: MoodboardSchema } } } },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/moodboards/{id}", tags: ["Moodboards"],
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: { description: "OK", content: { "application/json": { schema: MoodboardSchema } } } },
  });
  registry.registerPath({
    method: "patch", path: "/api/v1/moodboards/{id}", tags: ["Moodboards"],
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { "application/json": { schema: z.object({ name: z.string() }) } } },
    },
    responses: { 200: { description: "OK", content: { "application/json": { schema: MoodboardSchema } } } },
  });
  registry.registerPath({
    method: "delete", path: "/api/v1/moodboards/{id}", tags: ["Moodboards"],
    request: { params: z.object({ id: z.string() }) },
    responses: { 204: { description: "No Content" } },
  });

  // Catalogue
  registry.registerPath({
    method: "get", path: "/api/v1/catalogue", tags: ["Catalogue"],
    responses: { 200: { description: "OK", content: { "application/json": { schema: z.array(z.record(z.unknown())) } } } },
  });

  // Trends
  registry.registerPath({
    method: "get", path: "/api/v1/trends", tags: ["Trends"],
    request: {
      query: z.object({
        category: z.string().optional(),
        lifecycle: z.string().optional(),
        season: z.string().optional(),
        market: z.string().optional(),
        type: z.string().optional(),
      }),
    },
    responses: { 200: { description: "OK", content: { "application/json": { schema: z.array(z.record(z.unknown())) } } } },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/trends/{id}", tags: ["Trends"],
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: { description: "OK", content: { "application/json": { schema: z.record(z.unknown()) } } } },
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
  registry.registerPath({
    method: "post", path: "/api/v1/projects/{id}/moodboards", tags: ["Projects"],
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { "application/json": { schema: z.object({ moodboardId: z.string() }) } } },
    },
    responses: { 200: { description: "OK", content: { "application/json": { schema: ProjectSchema } } } },
  });

  // Cost
  registry.registerPath({
    method: "post", path: "/api/v1/cost/estimate", tags: ["Cost"],
    request: { body: { content: { "application/json": { schema: CostInputSchema } } } },
    responses: { 200: { description: "OK", content: { "application/json": { schema: CostEstimateSchema } } } },
  });

  // Looks
  registry.registerPath({
    method: "get", path: "/api/v1/looks", tags: ["Looks"],
    request: { query: z.object({ type: z.enum(["retail", "runway"]).optional(), limit: z.string().optional(), cursor: z.string().optional() }) },
    responses: { 200: { description: "OK", content: { "application/json": { schema: LookListResponseSchema } } } },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/looks/{lookId}", tags: ["Looks"],
    request: { params: z.object({ lookId: z.string() }) },
    responses: { 200: { description: "OK", content: { "application/json": { schema: LookSchema } } } },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/looks/{lookId}/garments", tags: ["Looks"],
    request: { params: z.object({ lookId: z.string() }) },
    responses: { 200: { description: "OK", content: { "application/json": { schema: z.array(GarmentElementSchema) } } } },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/looks/{lookId}/garments/{garmentId}", tags: ["Looks"],
    request: { params: z.object({ lookId: z.string(), garmentId: z.string() }) },
    responses: { 200: { description: "OK", content: { "application/json": { schema: GarmentElementSchema } } } },
  });

  // Workspace
  registry.registerPath({
    method: "get", path: "/api/v1/workspace", tags: ["Workspace"],
    request: { query: z.object({ project_id: z.string().optional() }) },
    responses: { 200: { description: "OK", content: { "application/json": { schema: z.array(WorkspaceSchema) } } } },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/workspace", tags: ["Workspace"],
    request: { body: { content: { "application/json": { schema: z.object({ name: z.string(), project_id: z.string() }) } } } },
    responses: { 201: { description: "Created", content: { "application/json": { schema: WorkspaceSchema } } } },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/workspace/{id}", tags: ["Workspace"],
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: { description: "OK", content: { "application/json": { schema: WorkspaceSchema } } } },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/workspace/{id}/elements", tags: ["Workspace"],
    request: { params: z.object({ id: z.string() }), body: { content: { "application/json": { schema: WorkspaceElementSchema } } } },
    responses: { 200: { description: "OK", content: { "application/json": { schema: WorkspaceSchema } } } },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/workspace/{id}/generate", tags: ["Workspace"],
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: { description: "OK", content: { "application/json": { schema: WorkspaceSchema } } } },
  });

  // Inventory
  registry.registerPath({
    method: "get", path: "/api/v1/inventory/garments", tags: ["Inventory"],
    responses: { 200: { description: "OK", content: { "application/json": { schema: z.array(z.object({ garment_type: z.string(), count: z.number() })) } } } },
  });
}
