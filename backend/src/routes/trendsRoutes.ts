import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { requireAuth } from "../middleware/auth.js";
import * as trendsController from "../controllers/trendsController.js";
import { streamTrendQuery } from "../services/trendQueryService.js";
import { ApiError } from "../utils/api-error.js";

export const trendsRouter = Router();

trendsRouter.use(requireAuth);
trendsRouter.get("/", asyncHandler(trendsController.list));
trendsRouter.get("/:id", asyncHandler(trendsController.getById));

trendsRouter.post(
  "/query/stream",
  asyncHandler(async (req, res) => {
    const { query } = req.body as { query?: unknown };
    if (!query || typeof query !== "string" || !query.trim()) {
      throw new ApiError(400, "query is required");
    }
    const agentRes = await streamTrendQuery(query.trim());
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Transfer-Encoding", "chunked");
    agentRes.data.pipe(res);
  }),
);
