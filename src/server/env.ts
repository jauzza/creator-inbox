import { z } from "zod";

const schema = z.object({
  MASTER_KEY: z.string().min(1, "MASTER_KEY is required (npm run secret:generate)"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
  SIMULATOR_WEBHOOK_SECRET: z.string().default("local-simulator-secret"),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),
  WORKER_POLL_MS: z.coerce.number().int().min(100).max(60000).default(1000),
});

let cached: z.infer<typeof schema> | null = null;
export function env() {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}
export function resetEnvCache() {
  cached = null;
}
