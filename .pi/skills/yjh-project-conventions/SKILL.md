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
apps/h5-client/       # H5 客户端（Taro + React，E 阶段）
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
pnpm dev:infra       # 本地 PostgreSQL + Redis（docker compose，需 Docker）
pnpm migrate / migrate:down / migrate:create / seed   # 数据库迁移（services/api）
pnpm content:validate / content:preview / content:pack  # 内容包（见 yjh-content-pack）
pnpm test:docs     # 协议一致性契约测试（docs/protocol.md ↔ 代码）
pnpm test:e2e      # E2E 冒烟（需真实 PostgreSQL + Redis：本地 pnpm dev:infra，CI 服务容器）
```

## E2E 与 CI/CD

- **E2E**：`services/api/e2e/`（真实 PG+Redis，迁移→起服→就绪/鉴权/DB/Redis 往返）。本地先 `pnpm dev:infra` 再 `pnpm test:e2e`；CI `e2e` 作业用服务容器提供 pg/redis 后运行。玩法全链路场景在 B/F 阶段扩展进 `e2e/`。
- **CI**（`.github/workflows/ci.yml`）：quality（build/typecheck/test/test:docs/lint/format + content:validate）、migrations（up/down）、e2e 三个作业。
- **CD**（`.github/workflows/deploy.yml`，脚手架）：main 推送/手动触发 → 构建 API 镜像推 GHCR → SSH 服务器 docker compose 更新。激活需 secrets `DEPLOY_HOST`/`DEPLOY_USER`/`DEPLOY_SSH_KEY`，见 `deploy/README.md`。
- 新增服务（worker、h5）时：补 Dockerfile、加入 `docker-compose.prod.yml` 与 CD 推送步骤。

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
4. **node-pg-migrate**：`runner` 是**函数**不是类（`await runner({ dbClient, dir, direction, migrationsTable })`，`dir` 用绝对路径）；**SQL 迁移不支持独立 `.down.sql` 文件**（down 必须与 up 同文件用 `-- down migration` 注释段）——本项目统一用 JS/CJS 迁移（显式 `exports.up/down`）。**复合主键必须作为 createTable 第三参数 options 传入**（`{ primaryKey: [...] }`），放进列对象会被当成名为 `primaryKey` 的列、type 解析为 undefined → PG 报 `type "undefined" does not exist`（CI migrations 作业踩过）。
5. **内容包 CLI 路径**：`packages/content/bin/yjh-content.mjs` 显式目录参数按**包根（packages/content）相对**解析，默认 fixtures/pack。
6. **git 换行警告**（LF→CRLF）是 Windows 正常提示，不影响提交内容；LPC 类部署才需要 CRLF 处理（本项目无 LPC）。

## 下一步参考

- 内容工作 → 读 `yjh-content-pack` skill。
- 计划任务状态 → `docs/design-and-development-plan.md` 执行记录表。
- 新增服务/包 → 复制现有包骨架（package.json + tsconfig 继承 `tsconfig.base.json` + src/index.ts + src/index.test.ts），并记得在根 workspace 声明。
