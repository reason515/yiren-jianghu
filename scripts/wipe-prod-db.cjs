#!/usr/bin/env node
/**
 * 生产库清空并重建 schema（允许改已应用迁移后全量 migrate；不做旧档保活）。
 * 用法：node scripts/wipe-prod-db.cjs
 */
const fs = require("node:fs");
const { Client } = require("ssh2");

const infoFile = process.env.SERVER_INFO_FILE || "D:/docs/jd-cloud-server/jd1.txt";
const [HOST, USER, PASSWORD] = fs
  .readFileSync(infoFile, "utf8")
  .split("\n")
  .map((s) => s.trim());

const sql = [
  "DROP SCHEMA public CASCADE;",
  "CREATE SCHEMA public;",
  "GRANT ALL ON SCHEMA public TO yiren;",
  "GRANT ALL ON SCHEMA public TO public;",
].join(" ");

const remote = [
  "cd /opt/yiren-jianghu",
  `docker compose -f docker-compose.prod.yml exec -T postgres psql -U yiren -d yiren_jianghu -v ON_ERROR_STOP=1 -c "${sql}"`,
  "echo WIPE_OK",
].join(" && ");

const ssh = new Client();
ssh
  .on("ready", () => {
    ssh.exec(remote, (err, stream) => {
      if (err) {
        console.error(err);
        process.exit(1);
      }
      let out = "";
      let errOut = "";
      stream
        .on("close", (code) => {
          if (out.trim()) console.log(out.trim());
          if (errOut.trim()) console.error(errOut.trim());
          const ok = code === 0 && out.includes("WIPE_OK");
          console.log(ok ? "✅ 生产库已重建 schema（待 migrate up）" : "❌ 清空失败");
          ssh.end();
          process.exit(ok ? 0 : 1);
        })
        .on("data", (d) => {
          out += d.toString();
        })
        .stderr.on("data", (d) => {
          errOut += d.toString();
        });
    });
  })
  .on("error", (e) => {
    console.error(e);
    process.exit(1);
  })
  .connect({ host: HOST, username: USER, password: PASSWORD });
