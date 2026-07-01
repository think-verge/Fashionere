import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { asyncHandler } from "../utils/async-handler.js";

const req = {} as Request;
const res = {} as Response;

describe("asyncHandler", () => {
  it("does not call next when handler resolves", async () => {
    const next = vi.fn() as NextFunction;
    const handler = asyncHandler(async () => {});
    handler(req, res, next);
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next with the error when handler rejects", async () => {
    const err = new Error("boom");
    const next = vi.fn() as NextFunction;
    const handler = asyncHandler(async () => {
      throw err;
    });
    handler(req, res, next);
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(next).toHaveBeenCalledWith(err);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
