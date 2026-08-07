<div align="center">

<span style="font-size: 28px;"><strong>《一人江湖》封测门禁与启动清单</strong></span><br/>
<span style="font-size: 18px;">G4 · 20–50 人封测前的核验清单与运营节奏</span>

</div>

---

# 1. 上线门禁（已核验项，✔ = 2026-08-07 验证）

| 项 | 状态 | 证据 |
| --- | --- | --- |
| 代码/测试门禁 | ✔ | 306 单测 + 3 契约 + 16 e2e（本地真库）全绿，CI 同步 |
| 生产全栈健康 | ✔ | postgres/redis healthy，api/worker running（117.72.34.43） |
| 迁移 | ✔ | 0001–0009 落生产库 |
| 生产入口接线 | ✔ | G1 修复后 40/40 路由真实 handler（曾全 501 stub） |
| 生产回归 | ✔ | 10/10 全通：登录→场景→学武→挂机启停→赛季→对手→对战→论坛→resume |
| Worker 结算 | ✔ | 服务器 `settle scanned=1 settled=1`；挂机收益落库 |
| 限流 | ✔（封测前收紧） | Redis 分布式固定窗口（`rl:*` key 落库）；125 连打第 121 个起 429。**测试期放宽**：`.env` `RATE_LIMIT_PER_MIN=100000`——封测前改回 120 并 recreate |
| 风控 | ✔ | frozen 账号拒绝登录（单测） |
| 备份 | ✔ | 每日 03:00 pg_dump + 保留 14 份；**恢复演练**（23 表完整） |
| 监控 | ✔ | 每 5 分钟探针（公网/容器/磁盘）失败写日志+退出码 |
| 日志轮转 | ✔ | json-file 10MB×3 |
| 战报归档 | ✔ | 每周日归档 30 天前 pvp 战报 report |
| 公网入口 | ✔ | `http://117.72.34.43/health` 通（Nginx 80→loopback） |
| 邀请码 | ✔（封测前收紧） | 35 个已注入生产。**测试期开 `ALLOW_ANY_INVITE=1`**（任意邀请码可登录）——**封测前必须置 0/删除并 recreate api**（见 §2.1） |
| 资源余量 | ✔ | 磁盘 35% / 内存可用 ~1.1GB（F4 基线：1,800+ RPS 余量充足） |

# 2. 封测运营

## 2.1 邀请发放
- 邀请码在服务器 `.env` 的 `INVITE_CODES`（逗号分隔）；变更后 `docker compose up -d --force-recreate api`。
- 单邀请码幂等绑定单账号；账号可放弃角色重开（30 天冻结后清理）。
- 建议：1 码 1 人，群发前先验证码未被误用（`accounts.invite_code` 可查）。

## 2.2 反馈通道
- 游戏内论坛（forum sections：江湖茶话/武林见闻/悬赏与恩怨）——**举报队列**（`forum_reports` open 状态）供运营审核。
- 封测群/文档收集 bug：标注设备/操作路径/时间（服务端有 requestId 可追溯）。
- 服务器审计：`audit_events` 记录关键操作（建角/放弃/模板/挂机起停/PVP/举报）。

## 2.3 周复盘节奏（G4 持续）
1. **数据**：注册/建角转化、DAU/在线峰值（`characters.created_at` + 会话活跃）、PVP 场次与积分分布、挂机作业量、成长曲线（exp/技能分布）——SQL 聚合脚本。
2. **反馈**：论坛帖子/举报归类，P0（进不去/丢档/结算错）优先。
3. **调参闭环**：内容包 params.json（数值）改后 5 处同步 → CI 校验 → 发版 → 周复盘对比。
4. **发版流程**：改代码 → 门禁全绿 → git archive → 服务器 `docker build` + `compose up -d`（见 deploy/README.md）；**迁移只追加**（0009 后新编号）。

## 2.4 应急预案
- **回滚**：`API_IMAGE=<上一 tag> docker compose up -d api`（应用回滚不自动回滚库；Schema 变更走向后兼容迁移）。
- **备份恢复**：`deploy/scripts/backup.sh` 产物 → `gunzip | psql`（恢复演练已验证）。
- **宕机自检**：`/var/log/yiren-healthcheck.log` → 容器状态 → Nginx → 磁盘/内存。
- **禁止** `docker compose down -v`（删除数据卷）。

# 3. 遗留与后续
- 正式域名 + HTTPS（备案后）；H5 客户端静态托管（Nginx location / 现指向 API）。
- 封测 3 个月后按 `docs/performance-baseline.md` 复核容量（pvp 战报归档已自动执行）。
- PVE 战斗域（F1 待办）：落地后统一 PVP 快照构造占位公式，任务/挂机 kill 相位可用真实结算替代 SQL 造数。
