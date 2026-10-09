import { Router } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../utils/async-handler.js";
import { ApiError } from "../utils/api-error.js";

export const assetRouter = Router();

// Public: <img> tags can't send auth headers. Serves deconstruction assets
// (sketches, flats, fabric swatches, pattern tiles) from the engine's bucket.
assetRouter.get(
  "/:gridfsId",
  asyncHandler(async (req, res) => {
    const id = req.params.gridfsId as string;
    if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid asset id");

    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, { bucketName: "swatches" });
    const objectId = new mongoose.Types.ObjectId(id);
    const [file] = await bucket.find({ _id: objectId }).limit(1).toArray();
    if (!file) throw new ApiError(404, "asset not found");

    res.set({
      "Content-Type": (file as { contentType?: string }).contentType || "image/png",
      "Content-Length": String(file.length),
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    bucket.openDownloadStream(objectId).on("error", () => res.end()).pipe(res);
  }),
);
