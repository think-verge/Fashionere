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
}
