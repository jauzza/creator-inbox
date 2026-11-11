import "dotenv/config";
import { startWorker } from "../server/queue/worker";
import { env } from "../server/env";

// Separate long-running process: `npm run worker` (or the `worker` service in docker-compose).
const e = env();
startWorker({ concurrency: e.WORKER_CONCURRENCY, pollMs: e.WORKER_POLL_MS }).catch((err) => {
  console.error(err);
  process.exit(1);
});
