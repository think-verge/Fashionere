import { defineConfig } from "orval";

export default defineConfig({
  fashionare: {
    input: {
      target: "./openapi/openapi.json",
    },
    output: {
      mode: "single",
      target: "./src/lib/api/generated/client.ts",
      schemas: "./src/lib/api/generated/model",
      client: "axios",
      override: {
        mutator: {
          path: "./src/lib/api/http.ts",
          name: "customInstance",
        },
      },
      clean: true,
    },
  },
});
