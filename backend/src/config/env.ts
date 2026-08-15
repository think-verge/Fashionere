import "dotenv/config";

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const env = {
  PORT: parseInt(process.env.PORT ?? "8000", 10),
  MONGODB_URI: process.env.MONGODB_URI ?? "mongodb://localhost:27017/centoire",
  FASHIONAIRRE_MONGO_URI:
    process.env.FASHIONAIRRE_MONGO_URI ?? "mongodb://localhost:27017/Fashionere",
  JWT_SECRET: process.env.JWT_SECRET ?? "change-me-in-production",
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  DECONSTRUCTION_ENGINE_URL: process.env.DECONSTRUCTION_ENGINE_URL ?? "http://localhost:8001",
  TREND_ENGINE_URL: process.env.TREND_ENGINE_URL ?? "http://localhost:8002",
  NODE_ENV: process.env.NODE_ENV ?? "development",
};
