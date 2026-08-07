import pg from "pg";
import { loadContentDir } from "@yjh/content";
import { startWorker } from "./index.js";

/** Worker 进程入口（Docker CMD: node dist/main.js）。 */
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("Worker 需要 DATABASE_URL（compose env_file 注入）");
}
const CONTENT_DIR = process.env.CONTENT_DIR ?? "/app/packages/content/fixtures/pack";

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 10 });
const { pack } = await loadContentDir(CONTENT_DIR);
const handle = await startWorker({ pool, content: pack });

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, async () => {
    await handle.stop();
    await pool.end();
    process.exit(0);
  });
}
