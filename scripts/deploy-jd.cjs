#!/usr/bin/env node
/**
 * 京东云服务器部署（G1 模式：服务器本地 docker build + H5 静态托管上传）。
 * 用法：node scripts/deploy-jd.cjs <explore|deploy>
 * 凭据：服务器信息文件（IP/用户/密码）由环境变量 SERVER_INFO_FILE 或默认
 *       D:/docs/jd-cloud-server/jd1.txt 读取；仅本次部署使用，不入库。
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execSync } = require("node:child_process");
const { Client } = require("ssh2");

const infoFile = process.env.SERVER_INFO_FILE || "D:/docs/jd-cloud-server/jd1.txt";
const [HOST, USER, PASSWORD] = fs
  .readFileSync(infoFile, "utf8")
  .split("\n")
  .map((s) => s.trim());

const cmd = process.argv[2] ?? "explore";
const ssh = new Client();
const conn = new Promise((resolve, reject) => {
  ssh
    .on("ready", resolve)
    .on("error", reject)
    .connect({ host: HOST, username: USER, password: PASSWORD });
});

function exec(c) {
  return new Promise((resolve, reject) => {
    ssh.exec(c, (err, stream) => {
      if (err) return reject(err);
      let out = "";
      let errOut = "";
      stream
        .on("close", (code) => resolve({ code, out, errOut }))
        .on("data", (d) => (out += d.toString()))
        .stderr.on("data", (d) => (errOut += d.toString()));
    });
  });
}

function check(c, label) {
  return exec(c).then((r) => {
    const ok = r.code === 0;
    console.log(`${ok ? "✅" : "❌"} ${label}`);
    if (r.out.trim()) console.log(r.out.trim().slice(0, 400));
    if (r.errOut.trim()) console.log("[stderr]", r.errOut.trim().slice(0, 400));
    if (!ok) throw new Error(`${label} 失败（exit ${r.code}）`);
  });
}

async function sftpUploadDir(sftp, localDir, remoteDir) {
  const files = fs.readdirSync(localDir, { withFileTypes: true });
  for (const f of files) {
    const lp = path.join(localDir, f.name);
    const rp = `${remoteDir}/${f.name}`;
    if (f.isDirectory()) {
      await exec(`mkdir -p ${rp}`);
      await sftpUploadDir(sftp, lp, rp);
    } else {
      await new Promise((res, rej) => sftp.fastPut(lp, rp, (e) => (e ? rej(e) : res())));
    }
  }
}

async function main() {
  await conn;
  console.log(`== 已连接 ${USER}@${HOST} ==`);

  if (cmd === "explore") {
    for (const c of [
      "ls -la /opt/yiren-jianghu",
      "ls -la /var/www/yiren",
      "docker compose -f /opt/yiren-jianghu/docker-compose.prod.yml ps",
      "docker images | grep yiren || true",
      "ls /opt/yiren-jianghu/deploy/",
    ]) {
      const r = await exec(c);
      console.log(`\n$ ${c}\n${r.out.trim() || "(无输出)"}`);
    }
    ssh.end();
    return;
  }

  if (cmd === "deploy") {
    const repo = path.resolve(__dirname, "..");
    const skipBuild = process.env.SKIP_BUILD === "1";
    if (!skipBuild) {
      const tar = path.join(os.tmpdir(), "yiren-release.tar");
      console.log("== [1/5] 本地打包源码（git archive）==");
      execSync(`git -C ${repo} archive --format=tar HEAD -o ${tar}`, { stdio: "inherit" });
      console.log("   tar:", tar, `${fs.statSync(tar).size / 1024 / 1024} MB`);

      console.log("== [2/5] 上传源码包并构建镜像 ==");
      await new Promise((res, rej) => {
        ssh.sftp((err, sftp) =>
          err
            ? rej(err)
            : sftp.fastPut(tar, "/opt/yiren-jianghu/release.tar", (e) => (e ? rej(e) : res())),
        );
      });
      await check(
        "cd /opt/yiren-jianghu/src && tar xf /opt/yiren-jianghu/release.tar && rm /opt/yiren-jianghu/release.tar",
        "解压源码",
      );
      await check(
        "cd /opt/yiren-jianghu/src && docker build -t yiren/api:main -f services/api/Dockerfile . && echo API_BUILD_OK",
        "构建 api 镜像",
      );
      await check(
        "cd /opt/yiren-jianghu/src && docker build -t yiren/worker:main -f services/worker/Dockerfile . && echo WORKER_BUILD_OK",
        "构建 worker 镜像",
      );
    } else {
      console.log("== [1-2/5] SKIP_BUILD=1，沿用服务器已有 yiren/api:main 与 worker 镜像 ==");
    }

    console.log("== [3/5] 重建服务并迁移 ==");
    // compose recreate 中断会留下 `hash_yiren-jianghu-prod-api-1` 占名，导致下次 up 冲突
    await check(
      "docker ps -aq --filter name=_yiren-jianghu-prod-api | xargs -r docker rm -f; docker ps -aq --filter name=_yiren-jianghu-prod-worker | xargs -r docker rm -f; true",
      "清理残留 compose 容器名",
    );
    await check(
      "cd /opt/yiren-jianghu && API_IMAGE=yiren/api:main WORKER_IMAGE=yiren/worker:main docker compose -f docker-compose.prod.yml up -d --force-recreate api worker",
      "compose up api/worker",
    );
    await new Promise((r) => setTimeout(r, 4000));
    await check(
      "cd /opt/yiren-jianghu && docker compose -f docker-compose.prod.yml exec api node node_modules/node-pg-migrate/bin/node-pg-migrate up && echo MIGRATE_OK",
      "数据库迁移（0010/0011）",
    );
    await check(
      "curl -fsS http://127.0.0.1:3000/health && curl -fsS http://127.0.0.1:3000/ready && echo READY_OK",
      "容器 health/ready",
    );

    console.log("== [4/5] 上传 H5 静态产物 ==");
    await check(
      "cd /var/www/yiren && rm -rf dist.bak && mv dist dist.bak && mkdir -p dist",
      "备份旧 dist",
    );
    const distDir = path.join(repo, "apps", "h5-client", "dist");
    await new Promise((res, rej) => {
      ssh.sftp((err, sftp) =>
        err ? rej(err) : sftpUploadDir(sftp, distDir, "/var/www/yiren/dist").then(res).catch(rej),
      );
    });
    await check("curl -fsS http://127.0.0.1/ | head -c 80 && echo H5_OK", "本地静态页");

    console.log("== [5/5] 公网验证 ==");
    await check("curl -fsS http://117.72.34.43/health && echo PUBLIC_API_OK", "公网 API");
    await check("curl -fsS http://117.72.34.43/ | head -c 80 && echo PUBLIC_H5_OK", "公网 H5");
    await check(
      "cd /opt/yiren-jianghu && docker compose -f docker-compose.prod.yml ps",
      "容器状态",
    );
    console.log("✅ 发布完成");
  }
  ssh.end();
}

main().catch((e) => {
  console.error("❌", e.message);
  ssh.end();
  process.exit(1);
});
