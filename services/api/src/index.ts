/** API 服务入口：bootstrap（配置读取 + 监听）。 */
import { createApp } from "./app.js";

export { createApp } from "./app.js";
export { createAppMeta } from "./meta.js";

const port = Number(process.env.API_PORT ?? 3000);
const app = await createApp({ logger: true });

try {
  await app.listen({ port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
