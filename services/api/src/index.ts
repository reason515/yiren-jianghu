/** API 服务入口：bootstrap（配置读取 + 监听）。
 * 生产/容器：注入 DATABASE_URL 时启用真实业务域（db + 内容包 + 就绪探测）；
 * 无 DATABASE_URL（纯骨架/单测导入）时保持 stub 行为。
 */
import pg from "pg";
import { loadContentDir } from "@yjh/content";
import { createApp, type AppDeps } from "./app.js";
import { createPgDb } from "./db.js";

export { createApp } from "./app.js";
export { createAppMeta } from "./meta.js";

const port = Number(process.env.API_PORT ?? 3000);
const DATABASE_URL = process.env.DATABASE_URL;
const CONTENT_DIR = process.env.CONTENT_DIR ?? "/app/packages/content/fixtures/pack";

let deps: AppDeps = {};
let pool: pg.Pool | undefined;
if (DATABASE_URL) {
  pool = new pg.Pool({ connectionString: DATABASE_URL, max: 20 });
  const { pack } = await loadContentDir(CONTENT_DIR);
  deps = {
    db: createPgDb(pool),
    content: pack,
    readiness: async () => {
      const reasons: string[] = [];
      try {
        await pool?.query("SELECT 1");
      } catch {
        reasons.push("postgres down");
      }
      return reasons;
    },
  };
}

const app = await createApp({ logger: true, deps });

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, async () => {
    await app.close();
    await pool?.end();
    process.exit(0);
  });
}

try {
  await app.listen({ port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
