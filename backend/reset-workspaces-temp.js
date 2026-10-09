import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  const uri = process.env.FASHIONAIRRE_MONGO_URI || process.env.MONGODB_URI;
  await mongoose.connect(uri);
  const workspacesCol = mongoose.connection.db.collection("workspaces");
  
  const w = await workspacesCol.findOne({ _id: new mongoose.Types.ObjectId("6ab4f5cd43728f558c186069") });
  console.log("Workspace:", w ? w.status : "Not found");
  
  // reset it forcefully
  if (w) {
      await workspacesCol.updateOne(
          { _id: new mongoose.Types.ObjectId("6ab4f5cd43728f558c186069") },
          { $set: { status: "draft", stage: 1 } }
      );
      console.log("Force reset to draft");
  }
  
  process.exit(0);
}

main();
