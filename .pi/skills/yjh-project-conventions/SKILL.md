---
name: yjh-project-conventions
description: 《一人江湖》(yiren-jianghu) 项目开发规范——单仓结构、开发命令、质量门禁、测试与提交约定、已定架构护栏与常见坑。任何在本仓库写代码、改配置、跑测试、补文档、提交代码的任务都必须先读本 skill，再动手。即使用户只说"加个功能"“改个 bug""跑一下测试""这个怎么部署"，只要涉及本仓库，都应使用本 skill 获取项目上下文。与内容包/Schema/pkuxkx 筛选相关的任务见 yjh-content-pack skill。
---

# 《一人江湖》项目开发规范

## 定位与护栏（先读，勿违反）

本项目是从零开始的新游戏（非 MUD 移植）。以下为已确认的架构决策，任何改动不得突破：

- **服务端权威**：角色、战斗、挂机、PVP、奖励、排行榜全部由服务端结算；客户端只展示与收集意图。
- **无原始指令**：玩家不接触命令行；交互一律走结构化 UI + 服务端 API 事件。
- **纯规则可测**：`packages/game-core` 是零 IO 的纯 TypeScript 规则引擎（不碰 DB/Redis/网络），确定性可复现（PVP 用固定种子）。
- **内容驱动**：地图/NPC/物品/技能/绝招/任务/数值都在 `packages/content` 的内容包中，不进代码。
- **跨端**：客户端用 Taro + React（先 H5，后续微信小程序）；不依赖浏览器专属能力。
- **单一货币**：首版仅银两；单潜能货币（有效潜能 = potential − learned_points）。
- **参考边界**：pkuxkx 仅作机制/内容研究来源，进入仓库的内容必须经 `docs/pkuxkx-content-catalog.md` 登记（见 yjh-content-pack）。

权威文档：`docs/project-charter.md`（立项决策）、`docs/design-and-development-plan.md`（里程碑与任务清单，改代码前先看对应任务状态）。

## 仓库结构

```text
apps/h5-client/       # H5 客户端（React 设计基线已落地；Taro 运行时接入为 E2.1 待办，接入前勿假设 Taro API 可用）
services/api/         # API 服务（Fastify 应用工厂 createApp，A5 起）
services/worker/      # 后台作业 Worker（挂机结算，C7 起）
packages/shared/      # 协议版本与共享类型（客户端/服务端共用）
packages/game-core/   # 游戏核心规则（纯 TS、确定性）
packages/content/     # 内容包 Schema、校验器、CLI、fixtures
docs/                 # 项目文档（手写排版，不参与 prettier）
.github/workflows/    # CI 门禁
```

## 开发命令（根目录）

```bash
pnpm install         # 安装依赖（pnpm 10，node >= 22，.nvmrc 固定）
pnpm build           # 构建所有包（pnpm -r，按拓扑顺序：shared 先于 game-core）
pnpm typecheck       # 类型检查（pnpm -r，跨包类型依赖 dist，必须先 build）
pnpm test            # vitest run（根扫描所有 *.test.ts）
pnpm lint            # ESLint（flat config，typescript-eslint）
pnpm format          # Prettier 写回（docs/ 与 pnpm-lock.yaml 已 ignore）
pnpm format:check    # 格式门禁
pnpm dev:infra       # 本地 PostgreSQL + Redis（docker compose，需 Docker；国内拉镜像先配 daemon.json；首次环境搭建见 docs/docker-local-setup.md）
pnpm migrate / migrate:down / migrate:create / seed   # 数据库迁移（services/api；脚本经 --env-file-if-exists 自动读根 .env 的 DATABASE_URL，CI 无 .env 时回退环境变量）
pnpm content:validate / content:preview / content:pack  # 内容包（见 yjh-content-pack）
pnpm test:docs     # 协议一致性契约测试（docs/protocol.md ↔ 代码）
pnpm test:e2e      # E2E 冒烟（需真实 PostgreSQL + Redis：本地 pnpm dev:infra，CI 服务容器）
```

## E2E 与 CI/CD

- **E2E**：`services/api/e2e/`（真实 PG+Redis，迁移→起服→全链路）。本地先 `pnpm dev:infra` 再 `pnpm test:e2e`；CI `e2e` 作业用服务容器提供 pg/redis 后运行。
  - `smoke.e2e.test.ts`（基础：就绪/鉴权/DB/Redis 往返）+ `journey.e2e.test.ts`（F3 全链路 11 步：登录→建角→恢复点→场景→学武→任务→挂机→PVP→断线恢复→装备→论坛→登出；F2 结算验证已并入）。
  - **e2e 文件串行**（`vitest.e2e.config.ts` `fileParallelism: false`）：每个文件 beforeAll 迁移同一真库，并行会迁移锁竞争。
  - **SQL 造数点标注**：依赖未落地的域（战斗/商店/回精）用 SQL 直接准备状态（如提 exp/潜能、推进任务相位、造行囊、回精），**必须注释标注"待 X 域落地后移除"**；唯一邀请码按运行生成 → 幂等可重跑。
  - **复用 dev 库的断言要稳健**：榜单/对手 TopN 会被历史运行数据占满（新角色 exp 0 排不进 Top10）——断言"排除自己/非空/计数≥"，不断言"包含特定新角色"。
  - **e2e 的价值**：mock db 测不到的真实集成问题——复合主键缺失（ON CONFLICT 42P10）、jsonb 二次解析、限流生效、精耗尽导致结算空转。新域落地后至少让 journey 走一遍。
- **CI**（`.github/workflows/ci.yml`）：quality（build/typecheck/test/test:docs/lint/format + content:validate）、migrations（up/down）、e2e 三个作业。
- **CD**（`.github/workflows/deploy.yml`，脚手架）：main 推送/手动触发 → 构建 API/Worker 镜像推 GHCR → scp 上传发布脚本 → SSH 执行。激活需 secrets `DEPLOY_HOST`/`DEPLOY_USER`/`DEPLOY_SSH_KEY`。**部署运维细节（loopback 绑定、.dockerignore、镜像加速、回滚、down -v 警示）见 `deploy/README.md`（吸收 typhoon 部署规范 + G1 实战）**。
- 新增服务（worker、h5）时：补 Dockerfile、加入 `docker-compose.prod.yml` 与 CD 推送步骤；**并检查容器入口接线**（见常见坑 #24）。
- **G1 服务器部署实战要点（117.72.34.43，京东云 2GB 小机）**：镜像用**服务器本地 docker build**（git archive 源码包上传 → build，buildkit 缓存复用，2GB 内存 OK）；**自定义 tag（如 yiren/api:main）不被 daocloud 镜像代理**（白名单外）——`API_IMAGE=yiren/api:main docker compose up` 指向本地镜像；**容器内 `DATABASE_URL`/`REDIS_URL` 的 host 用 compose 服务名（postgres/redis）非 localhost**；Nginx 只绑 loopback 转发（公网 80→127.0.0.1:3000）；Windows 无 sshpass 时用 node+ssh2 脚本（密码认证）执行 SSH/SFTP。
- **G4 生产回归脚本要点（beta-regression.sh，封测门禁在用）**：回归前**清理残留状态**（如旧挂机 running → 先 stop）；**API 响应解析要断言结构**（shell+python 里 `assert isinstance(d, list)` 防把错误信封 `{"error":...}` 误读成正常数据——G4 曾把 `len({"error"})==1` 当"对手数 1"）；**幂等准备**（建角 409 忽略、回精 SQL）；curl 辅助函数注意**参数顺序**（path/token/body）。封测门禁清单见 `docs/beta-launch-checklist.md`。
- **服务器 cron 配置后必须 `crontab -l` 验证**（G4 发现 G2 配的 cron 意外丢失）；cron 条目纳入备份/清单核验项。

## Worker 作业模式（F2，后台任务照此扩展）

- **纯函数结算与 DB 落地分离**：`worker/src/settlement.ts`（无 IO 纯函数，单测覆盖成长细节）+ `run.ts`（DB 读写）。
- **DB 轮询替代 Redis 延迟队列**：以 `last_tick_at` 为基准结算 `deltaHours`——离线期间照常推进，**崩溃恢复天然覆盖**（启动即跑一轮）。封测规模（<1k 作业）轮询足够；量大再上 Redis。
- **并发幂等三件套**：每作业一个事务 + `SELECT ... FOR UPDATE` 行锁抢占（多实例不重复结算）+ 原子写回（作业状态/角色资源/技能在同事务提交）。
- **结算粒度**：挂机频率参数进内容包 params（`afk.studyAttemptsPerHour`），worker 按时长换算次数并**封顶**（2000）防失控；精/气血耗尽即停（不报错）。
- **终态写战报**：`report` jsonb（含 wuxia 叙事）+ `read_at` 未读（resume 拉取后置已读）。
- 集成验证：e2e 直接调用 `settleDueJobs({ pool, content, now })`（now 前移模拟时长），断言资源消耗信号而非精确成长值（成长细节归纯函数单测）。

## 文档-代码-测试一致性机制（Q2）

- **单一事实来源**：协议类型在 `@yjh/shared`（`PROTOCOL_VERSION`/`EVENT_TYPES`），内容 Schema 在 `@yjh/content`；禁止在别处复制定义。
- **协议清单**：`docs/protocol.md` 是路由/事件的唯一人工维护入口；`services/api/src/protocol.contract.test.ts` 强制「清单路由 = 已注册路由、事件集合 = EVENT_TYPES、版本 = PROTOCOL_VERSION」，`pnpm test:docs` 不一致即失败。新增/修改 API 或事件必须同步三处：代码 / 测试 / `docs/protocol.md`（PR 模板「三件套」）。
- **内容一致性**：内容包 fixtures 由 CI validate；Schema 改动必须同步校验器测试与 yjh-content-pack 文档。
- **执行记录**：每完成计划任务更新 `docs/design-and-development-plan.md` 执行记录表。
- 示例即测试：文档中的内容包示例应来自 fixtures（CI 校验通过的真实例子），防止文档写出 Schema 不支持的格式。

## 质量门禁（CI 同步执行）

提交前必须全绿：`pnpm build` → `pnpm typecheck` → `pnpm test` → `pnpm lint` → `pnpm format:check`。
CI（`.github/workflows/ci.yml`）含：quality 作业 + migrations 作业（postgres 服务容器跑 migrate up/down）。

## 测试约定

- 单测用 vitest；根目录 `pnpm test` 一次跑全部包。
- **跨包 workspace 依赖（如 game-core → @yjh/shared）在测试/类型检查前必须先 build**（exports 指向 dist）。改了被依赖包的源码后忘记 build，会出现"类型找不到/运行时 undefined"的假失败。
- 规则引擎（game-core）的测试必须验证**确定性**：同输入同种子 → 同输出。
- **结算自洽测试**：结算类逻辑（PVP 积分、任务奖励、挂机收益）的测试用**同一 game-core 规则重算**核对落库值，而不是只断言"有值"（如 M2.5-pvp：测试重跑 `computeScoreChanges` 验证 pvp_scores 与结果自洽）——捕获"服务端公式与规则引擎漂移"。
- 新增/修改逻辑必须补单测；bug 修复按项目惯例补回归用例。

## 提交约定

- 信息格式：`feat|fix|docs|refactor|test|ci|chore(<scope>): 描述`，中文描述。
- PR 模板在 `.github/pull_request_template.md`，含计划任务与 pkuxkx 权利登记勾选项。
- 每完成一个计划任务，在 `docs/design-and-development-plan.md` 的执行记录表中更新状态。

## 文档约定

- 文档集中在 `docs/`；对外阅读文档用统一格式：**标题用居中加粗 title block（不用 H1），正文从 H1 开始**。
- `docs/` 与 `pnpm-lock.yaml` 已在 `.prettierignore`，不要对它们跑 prettier 写回。

## 常见坑（本项目实际踩过）

1. **pnpm 10 默认拦截依赖的 build 脚本**（如 esbuild）。已批准方式：根 `package.json` 的 `pnpm.onlyBuiltDependencies` 声明，勿用交互式 approve。
2. **脚本名别叫 `pack`**：`pnpm --filter X pack` 会触发 npm pack 而不是你的脚本。内容包打版脚本名是 `bundle`。
3. **Fastify v5**：`reply.locals` 不存在、`req.log` 是只读 getter。认证上下文用 `WeakMap<FastifyRequest, ...>`；requestId 用内置 `requestIdHeader`/`genReqId`。
4. **node-pg-migrate**：`runner` 是**函数**不是类（`await runner({ dbClient, dir, direction, migrationsTable })`，`dir` 用绝对路径）；**SQL 迁移不支持独立 `.down.sql` 文件**（down 必须与 up 同文件用 `-- down migration` 注释段）——本项目统一用 JS/CJS 迁移（显式 `exports.up/down`）。**复合主键必须用 `pgm.addConstraint(table, name, { primaryKey: [...] })`**——`{ primaryKey: [...] }` 不是合法的 createTable 第三参选项，会被 node-pg-migrate **静默忽略**（不报错、不建约束），表照样建出来、ON CONFLICT 直到运行时才 42P10（F3 e2e 全链路抓出：character_skills/pvp_scores/forum_likes 三表都中招；单列 `primaryKey: true` 在列对象里是合法的）。**已发布的迁移只追加不修改**：本地/CI 已应用过 0001 之后发现表缺列/缺约束，一律新增编号迁移（0006–0009 模式）；修复既有库用 `pgm.sql` + `DO $$ ... IF NOT EXISTS` 条件补约束（幂等，新旧库皆可跑），同时修 0002/0004/0005 源码让新库直接建对。
5. **内容包 CLI 路径**：`packages/content/bin/yjh-content.mjs` 显式目录参数按**包根（packages/content）相对**解析，默认 fixtures/pack。
6. **git 换行警告**（LF→CRLF）是 Windows 正常提示，不影响提交内容；LPC 类部署才需要 CRLF 处理（本项目无 LPC）。
7. **`index.ts` 的 `export *` 同名导出冲突**：game-core 各模块用 `export *` 汇总，若两个模块导出同名符号（如 growth 与 params 都有 `effectivePotential`）会报 "has already exported a member"。解决：后者只 `import` 使用、不 re-export（growth 的 effectivePotential 从 params 导入）。
8. **game-core 规则模块地图（C1–C10 已落地，新增规则模块照此扩展并 export 到 index）**：
   `params`（数值参数）→ `vitals`（动态上限）→ `combat`（战斗引擎+seeded RNG）→ `perform`（绝招）→ `growth`（成长）→ `tactic`（战术模板，zod）→ `afk`（挂机作业）→ `pvp`（快照/ELO/赛季）→ `economy`（账本/掉落/商店）→ `map`（房间图/导航）。game-core 带 zod 依赖（战术模板 Schema），仍是零 IO 纯函数包。
9. **GitHub Actions**：
   - `secrets` **不能直接用于 `if` 条件**（工作流直接判无效、运行显示无 job 即失败）——先 `env: { X: ${{ secrets.X }} }` 再 `if: env.X != ''`；
   - 运行"无任何 job 直接失败" = 工作流 YAML/表达式解析错误；
   - Docker Hub/registry 返回 502 等瞬时故障（如拉 buildx 镜像）→ **直接 Re-run，不要改代码**；
   - 弃用告警（Node20 actions）可通过升级 action 大版本消除（checkout@v5、setup-node@v5）。
10. **vitest 自定义 include 覆盖默认排除**：配置了 `include` 后必须同时把 `exclude` 写全，且模式要带 `**/` 前缀（如 `"**/node_modules/**"`），否则会误扫依赖自带测试（曾误跑 zod 的 2873 个测试）。
11. **门禁管道吞退出码**：`pnpm lint 2>&1 | tail` 会让退出码变成 tail 的（0），坏状态照样继续 commit。跑门禁不要接管道过滤，或检查 `$?`。
12. **React 19 + tsc 声明（h5-client 前端约定）**：

- 组件函数必须显式返回类型 `: JSX.Element`（import type { JSX } from "react"），否则 declaration emit 报 TS2742 "cannot be named without reference to @types/react"；
- `@types/react` / `@types/react-dom` 必须作为**消费包的 devDependencies**（pnpm 严格隔离，根 devDeps 不可见）；
- vitest include 需覆盖 `.tsx`：`"**/*.test.{ts,tsx}"`；**含 JSX 的测试文件必须命名 `.tsx`**（哪怕放 lib/，命名 `.ts` 会 JSX 解析失败，E12 reconnect 踩过）；
- DOM 测试文件头部加 `// @vitest-environment happy-dom`（happy-dom 为测试包 devDep）；
- React 受控 input 测试：直接设 `input.value` 不触发 onChange，须用原生 value setter（`Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set`）再 dispatch `input` 事件。

13. **受控组件 DOM 测试（E6 踩过）**：

- **受控组件（props 驱动）的 onChange 测试必须用 useState harness**：只捕获数据而不更新 props，UI 不重渲染，DOM 断言必失败（TacticEditor 教训）；
- React 重渲染后**旧 DOM 引用失效**：多次点击后要重新查询（`const row = () => host.querySelector(...)`），不要缓存节点；
- 测试辅助函数（`props()`）须**显式返回组件 Props 类型**，否则 onChange 等函数类型被推断成联合，闭包参数变 `never`（TS2339）。

14. **组件与类型同名、SVG 测试（E7/E9 踩过）**：

- 组件与类型同名（如 `AfkReportView` 既是组件又是接口）会导致 `export *` 重复导出冲突（TS2308）——类型改名 `*Data` 或组件改名；
- **happy-dom 的 SVG 元素（g/rect）没有 `.click()`**——DOM 测试用 `dispatchEvent(new MouseEvent("click", { bubbles: true }))`（E9 MapSheet）；
- happy-dom 的 SVG 测量 API（`getTotalLength()` 等）可能未实现，测试勿依赖；用节点/边数量断言代替。

15. **mock db SQL 分支顺序敏感**：内存 mock 按 `text.includes(...)` 匹配，**具体的 SELECT（带全列）要放在通用分支（如 `FROM characters WHERE account_id`）之前**，否则字段被吞成 undefined（M2.5-character 踩过）。新增查询前先确认分支顺序。
16. **本地 Docker 环境（一次性搭建坑，详见 `docs/docker-local-setup.md`）**：安装器下载判完成看 `Content-Length`（勿凭感觉估大小）；`install --quiet --accept-license` 必须 `Start-Process -Verb RunAs` 提权（UAC 超时会被取消）；**WSL2 未启用时 engine 起不来**（后端日志 `dialing 192.168.65.7 ... context canceled`）→ 管理员 `wsl --install --no-distribution` + 重启；Windows daemon.json 在 `%USERPROFILE%\.docker\daemon.json`，改后重启 Docker Desktop 生效；`pnpm migrate` 报 `SASL ... client password must be a string` = `.env` 未被加载（脚本已用 `--env-file-if-exists` 兜底）。
17. **查询行类型必须用 `type` 别名而非 `interface`**：`db.query<T>` 的 T 受 `DbRow`（`{[key: string]: unknown}`）约束，**命名 interface 无索引签名不满足约束**（TS2344），inline 字面量或 `type` 别名可以（M2.5-skills/quests 踩过）。
18. **`noUncheckedIndexedAccess` 下 Record/数组索引返回 `T | undefined`**：`result.skills[skillId]`、`quest.phases[phase]` 都可能是 undefined——成功分支用 `!` 断言（如 learn/practice 后的 `next`），遍历用 `if (!x) continue` 判空；别用 `?? 默认值` 掩盖逻辑错误。
19. **mock db 分支匹配“SET X”陷阱**：`text.includes` 匹配的必须是**连续子串**——`SET progress = $1, status = 'completed'` 不包含连续子串 `SET status`，匹配要用 `status = 'completed'`；新增 SQL 前确认分支模式与真实 SQL 的字符连续性能对上（M2.5-quests 踩过）。**同类：DELETE 的 FROM 子串陷阱**——`DELETE FROM sessions WHERE token` 包含 `FROM sessions WHERE token`，会被前面的 SELECT 分支抢先匹配导致删除不生效（M2.5 收尾 logout 踩过，登出后 token 仍有效，集成测试抓出）；SELECT 分支用完整列名（如 `SELECT account_id, expires_at FROM sessions`）或把 DELETE 分支放前面。
20. **路由集成测试错误断言在 `.json().error` 下**：错误信封为 `{ error: { code, message, requestId } }`，`app.inject` 后断言错误要 `(res.json() as { error: { code } }).error`（M2.5-skills/quests 集成测试踩过）；服务层直接 `rejects.toMatchObject({ code })` 不受影响。
21. **服务端运行时校验字段的类型用 `string` 而非字面量联合**：路由层收 `unknown` → 服务端 `if (kind !== "study" && kind !== "quest") throw invalid_kind`——若入参类型收窄成 `"study" | "quest"`，非法分支会变 TS 死代码（M2.5-afk 踩过：`AfkStartInput.kind` 一度收窄导致 `invalid_kind` 断言无法编译，放宽为 string 后校验分支才可测）。服务端权威：**类型收窄只做防御，业务校验始终以运行时为准**。
22. **jsonb 列 SELECT 返回的是已解析对象（真库）**：pg 驱动对 jsonb 自动解析成对象，而 mock db 常存 JSON 字符串——读侧 `JSON.parse(value)` 在真库会抛 `"[object Object]" is not valid JSON`（F3 e2e 全链路抓出：afk/reports 与 pvp/matches 两处）；**读 jsonb 一律双保险** `typeof v === "string" ? JSON.parse(v) : v`（templatesService 早有此守卫）。写侧 `JSON.stringify` 不变。
23. **部署脚本的管道吞退出码（#11 的部署变体）**：`docker build ... | tail -1` 让 exit code 变 tail 的（0）——build 失败照样 `compose up` 旧镜像（G1 踩过：worker 镜像 build 失败但旧镜像被重启）。部署命令不要接管道，或用 `&&`/检查 `$?`（G1 用 `docker build ... > log && echo BUILD_OK` 模式）。
24. **生产容器入口必须显式接线 db/content（工厂测试通过 ≠ 入口接线）**：`createApp({ deps })` 只在测试/本地显式注入；**生产入口 `index.ts` 不读 DATABASE_URL 时全部路由走 501 stub**（G1 生产冒烟抓出：M2.5 全程本地注入测过但容器里全 stub）；Worker 同理需要独立 `main.ts` 进程入口（只导出函数会让容器 `Restarting (0)` 循环）。新增服务上线前：验证容器入口（非 build/单测）+ 生产冒烟脚本（登录→建角→场景→挂机→论坛等一条真实链路）。
25. **vite SPA 工程（H5 组装阶段踩过）**：① `import.meta.env` 需 `tsconfig` `types` 加 `"vite/client"`（tsconfig.base 的 `types: ["node"]` 会挡住）；② **`eslint-disable` 注释引用未安装的插件规则 = eslint error "rule not found"**（App.tsx 曾 `// eslint-disable-line react-hooks/exhaustive-deps` 而项目未装 eslint-plugin-react-hooks——删注释而非留引用）；③ **package.json 重复 `devDependencies` 键**：后块覆盖前块（vite 被吞）——JSON 同名键不报错；④ vite `base: "./"` + `VITE_API_BASE=/api`（生产 nginx `location /api/ { proxy_pass http://127.0.0.1:3000/; }` 去前缀；`location /api`（无尾斜杠）会把 `/api/health` 变成 `//health`）。
26. **浏览器自动化验证的干扰（G4/H5 实测）**：① **生产限流（120/分钟/IP）会被自动化高频请求触发**——连续 eval/curl 会让验证循环自己撞 429，App 按设计清 token 回登录页；验证要"静默窗口 + 低频率"，或测试期调大 `RATE_LIMIT_PER_MIN`；② **React 19 受控输入在 CDP eval 注入不触发 onChange**（原生 setter + input 事件无效）——真实用户打字正常；自动化验证优先走 API 层 + localStorage 塞 token 绕过登录页；③ 前端真机验证的边界：渲染/链路可自动化，交互留给真实用户低频率操作。

## 服务端域实现模式（M2.5，新增域照此扩展）

- 每域一个 `services/api/src/<domain>Service.ts`：`create<Domain>Service(db)` 工厂返回方法集；业务错误用 `<Domain>Error` 类（`code` 进错误信封）。
- `db.ts` 的 `Db` 接口（`query<T extends DbRow>`）注入；单测用内存 mock db（见常见坑 #15/#19）。
- 路由在 `app.ts` 中 **deps.db 存在时注册**（真实路由先注册，`registerApiStubs` 的 hasRoute 自动让位 stub）；错误统一 `envelope(reply, 400|401|404|409, err.code, err.message)`；需登录路由加 `preHandler: requireAuth(verifyToken)`，accountId 从 `authContexts.get(req)` 取。
- 状态迁移写进 service（如 discard：active→discarded + discarded_at；任务 accepted→completed→reported）；DB 约束作兜底而非主校验。
- 跨包调用 game-core 规则（校验/结算）在 service 内引用，客户端不跑规则（服务端权威）；**api 首次依赖 game-core 时需 `pnpm install` + 先 `pnpm build`**（workspace 依赖指向 dist，未 build 会出现类型/运行时假失败）。
- **跨域进度钩子**：域间推进不放路由——在 service 内暴露内部方法并单测（如 questsService.recordProgress 供战斗/挂机域驱动相位），待消费域落地后再决定是否开放路由。
- **新增/调整路由必须三件套**：`apiManifest.ts` + `docs/protocol.md` + 契约测试（M2.5-skills 补过 `POST /skills/study`：计划写"三接口"但清单漏了 study）。注册真实路由前先在清单补行，stub 靠 hasRoute 让位。
- **校验分层**：结构校验（zod `safeParse`）→ 语义校验（引用完整性，如 `validateTacticTemplate` 的未知绝招/未知技能）两层；语义 error 拒绝、warning 放行（M2.5-templates）。
- **查询接口的“常态空态”与“错误”分开**：`GET /afk/status` 无作业是正常态（返回 `{ active: false }`），404 只留给“无角色/资源不存在”；不要把“没内容”当 404（M2.5-afk）。
- **服务端文案也是玩家文案**：错误消息、战报叙事（afk `narrative`）会直接进客户端 UI——动笔前按任务启动必读加载 `yjh-wuxia-copywriting`（短句、无数值、武侠调性），不能写成说明文。
- **占位规则必须显式标注**：跨域规则未落地时，占位实现（如 PVP 快照构造用 C2 真公式 + 门类等级线性占位）要（a）代码注释标注"占位，待 X 域统一"（b）在计划文档登记待办——防止两套公式漂移、主域落地时漏替换（M2.5-pvp buildSnapshot 待 F 战斗域统一）。
- 单测覆盖：成功路径、各错误分支、状态迁移；集成测试用 `createApp({ deps: { db } })` + `app.inject`（错误断言见常见坑 #20）。

## 任务启动必读（按任务类型加载，勿凭记忆；即使本会话已读过也需重新 read）

| 任务类型                                         | 第一步必读 skill                                                                                |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 写/改内容包（房间/NPC/物品/任务/剧情/绝招/数值） | `yjh-content-pack`；含玩家文案时**同步** `yjh-wuxia-copywriting`；涉及地图时加 `yjh-map-design` |
| 写/改任何玩家可见文案                            | `yjh-wuxia-copywriting`（本任务第一步）                                                         |
| 设计/变更机制或数值决策                          | `yjh-design-docs`（决策登记）                                                                   |
| 前端/界面/交互                                   | `yjh-mobile-ui`                                                                                 |
| 区域地图/世界地图/场景方位图                     | `yjh-map-design`                                                                                |
| 通用开发/测试/部署                               | 本 skill（`yjh-project-conventions`）                                                           |

## 下一步参考

- 内容工作 → 读 `yjh-content-pack` skill。
- 玩家可见文案 → 读 `yjh-wuxia-copywriting` skill（绝招/房间/NPC/任务/剧情）。
- 计划任务状态 → `docs/design-and-development-plan.md` 执行记录表。
- 项目级规则与技能触发 → `.pi/agent/AGENTS.md`。
- 新增服务/包 → 复制现有包骨架（package.json + tsconfig 继承 `tsconfig.base.json` + src/index.ts + src/index.test.ts），并记得在根 workspace 声明。
