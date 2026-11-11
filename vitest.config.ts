import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
    env: {
      MASTER_KEY: "dGVzdC1tYXN0ZXIta2V5LTMyLWJ5dGVzLWxvbmctISE=",
      APP_URL: "http://localhost:3000",
    },
  },
});
