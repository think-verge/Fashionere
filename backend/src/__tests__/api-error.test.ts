import { describe, it, expect } from "vitest";
import { ApiError } from "../utils/api-error.js";

describe("ApiError", () => {
  it("is an instance of Error", () => {
    const err = new ApiError(400, "bad request");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
  });

  it("sets name to ApiError", () => {
    expect(new ApiError(400, "bad request").name).toBe("ApiError");
  });

  it("sets statusCode and message", () => {
    const err = new ApiError(404, "not found");
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe("not found");
  });

  it("works with 500 status", () => {
    const err = new ApiError(500, "internal error");
    expect(err.statusCode).toBe(500);
  });
});
