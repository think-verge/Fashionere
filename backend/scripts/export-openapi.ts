import fs from "node:fs";
import path from "node:path";
import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { registerPaths, registry } from "../src/schemas/index.js";

registerPaths();

const generator = new OpenApiGeneratorV3(registry.definitions);
const document = generator.generateDocument({
  openapi: "3.0.0",
  info: {
    title: "Centoire API",
    version: "1.0.0",
    description: "AI-powered fashion platform API",
  },
  servers: [{ url: "http://localhost:8000" }],
});

const outputPath = path.resolve("openapi/openapi.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(document, null, 2));
console.log(`OpenAPI spec exported to ${outputPath}`);
