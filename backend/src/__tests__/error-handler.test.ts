import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/api-error.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";

function makeRes() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { res: { status } as unknown as Response, json, status };
}

const req = { method: "GET", path: "/test" } as Request;
const next = vi.fn() as NextFunction;

describe("notFoundHandler", () => {
  it("responds with 404 and route info", () => {
    const { res, status, json } = makeRes();
    notFoundHandler(req, res);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.stringContaining("/test") })
    );
  });
});

describe("errorHandler", () => {
  it("returns statusCode and message for ApiError", () => {
    const { res, status, json } = makeRes();
    errorHandler(new ApiError(403, "forbidden"), req, res, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ detail: "forbidden" });
  });

  it("returns 500 for unknown errors", () => {
    const { res, status, json } = makeRes();
    errorHandler(new Error("something went wrong"), req, res, next);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ detail: "Internal server error" });
  });

  it("returns 500 for non-Error throws", () => {
    const { res, status, json } = makeRes();
    errorHandler("string error", req, res, next);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ detail: "Internal server error" });
  });
});
