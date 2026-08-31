import mongoose from "mongoose";

const deconCol = () => mongoose.connection.db!.collection("deconstructions");

export async function getGarmentInventory() {
  const results = await deconCol()
    .aggregate([
      { $unwind: "$garments" },
      { $group: { _id: "$garments.garment_type", count: { $sum: 1 } } },
      { $project: { garment_type: "$_id", count: 1, _id: 0 } },
      { $sort: { count: -1 } },
    ])
    .toArray();
  return results;
}
