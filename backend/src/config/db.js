import mongoose from "mongoose";

export async function connectDB() {
  const uri = process.env.FASHIONAIRRE_MONGO_URI;
  if (!uri) throw new Error("FASHIONAIRRE_MONGO_URI is not set");
  await mongoose.connect(uri);
  console.log("MongoDB connected →", mongoose.connection.name);
}
