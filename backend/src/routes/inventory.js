import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// GET /inventory/garments?source=vogue&season=Fall&year=2025
router.get("/garments", async (req, res, next) => {
  try {
    const { source, season, year } = req.query;
    const db = mongoose.connection.db;

    const matchStage = { status: "complete" };
    if (source) matchStage.brand = source;

    const pipeline = [
      { $match: matchStage },
      { $unwind: "$garments" },
      { $group: { _id: "$garments.garment_type", count: { $sum: 1 } } },
      { $match: { _id: { $ne: null } } },
      { $sort: { count: -1 } },
      { $project: { _id: 0, garment_type: "$_id", count: 1 } },
    ];

    // If season/year filter needed, join with canonical_looks
    // For now, aggregate directly on deconstructions
    const results = await db.collection("deconstructions").aggregate(pipeline).toArray();
    res.json(results);
  } catch (err) {
    next(err);
  }
});

export default router;
