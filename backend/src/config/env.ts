import "dotenv/config";

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const env = {
  PORT: parseInt(process.env.PORT ?? "3001", 10),
  MONGODB_URI: process.env.FASHIONAIRRE_MONGO_URI ?? process.env.MONGODB_URI ?? "mongodb://localhost:27017/Fashionere",
  JWT_SECRET: process.env.JWT_SECRET ?? "change-me-in-production",
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  AGENT_URL: process.env.AGENT_URL ?? "http://localhost:8001",
  NODE_ENV: process.env.NODE_ENV ?? "development",
  FAL_KEY: process.env.FAL_KEY ?? "",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? "",
  GEMINI_MODEL: process.env.GEMINI_MODEL ?? "gemini-flash-latest",
  // Judgement-heavy calls (Stage 3 stylist and art director) use the Pro model.
  GEMINI_PRO_MODEL: process.env.GEMINI_PRO_MODEL ?? "gemini-pro-latest",
  ASSET_BASE_URL: process.env.ASSET_BASE_URL ?? "/api/v1/assets",
  SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY ?? "fashionere_shopify_api_key",
  SHOPIFY_API_SECRET: process.env.SHOPIFY_API_SECRET ?? "fashionere_shopify_api_secret",
  SHOPIFY_SCOPES: process.env.SHOPIFY_SCOPES ?? "read_products,read_product_listings",
  SHOPIFY_APP_URL: (process.env.SHOPIFY_APP_URL && !process.env.SHOPIFY_APP_URL.includes("your-live-domain.com") && !process.env.SHOPIFY_APP_URL.includes("your-domain.com"))
    ? process.env.SHOPIFY_APP_URL
    : "http://localhost:3001",
};
