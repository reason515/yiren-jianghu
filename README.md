# 《一人江湖》

面向移动端的现代武侠角色扮演游戏。玩家在线进入个人化江湖，专注探索、剧情、手动 PvE、服务端挂机、异步 PVP 与轻量社区互动。

> 当前阶段：项目定义与技术预研。H5 邀请制封测优先，成熟后适配微信小程序。

## 文档

| 文档                                                  | 说明                                                                    |
| ----------------------------------------------------- | ----------------------------------------------------------------------- |
| [项目立项与技术决策](docs/project-charter.md)         | 已确认的产品定位、技术架构、账号、战斗、挂机、PVP、论坛、测试与运维决策 |
| [pkuxkx 内容筛选目录](docs/pkuxkx-content-catalog.md) | 从 pkuxkx 提取内容的唯一入口，含筛选标准与权利登记                      |
| [设计与开发计划](docs/design-and-development-plan.md) | 里程碑、按序任务清单与执行记录                                          |

## 核心原则

- **在线单人沉浸**：玩家不在地图中相遇或争抢资源。
- **服务端权威**：角色、战斗、挂机、奖励与排行榜均由服务端结算。
- **移动端结构化交互**：不向玩家暴露 MUD 原始命令行。
- **跨端演进**：先 H5 封测，客户端从第一天起保持微信小程序适配能力。
- **独立新作**：不兼容既有 MUD 账号、角色或 LPC 存档；pkuxkx 仅作为经审查的机制与内容研究来源。

## 规划技术栈

- 客户端：Taro + React + TypeScript
- 服务端：Node.js + TypeScript
- 数据与作业：PostgreSQL + Redis Worker
- 内容：Git 管理的 JSON/YAML 内容包
- 部署：Docker Compose

## 仓库结构

```text
yiren-jianghu/
├── apps/h5-client/       # H5 客户端（Taro + React，任务 E 阶段）
├── services/api/         # API 服务（Fastify，任务 A5 起）
├── services/worker/      # 后台作业 Worker（挂机结算，任务 C7 起）
├── packages/shared/      # 协议版本与共享类型
├── packages/game-core/   # 游戏核心规则引擎（纯 TS、确定性）
├── packages/content/     # 内容包 Schema、校验与打包
├── docs/                 # 项目文档
└── package.json          # pnpm workspace 根
```

## 开发命令

```bash
pnpm install      # 安装依赖
pnpm build        # 构建所有包（按拓扑顺序）
pnpm typecheck    # 类型检查
pnpm test         # 单元测试（vitest）
pnpm lint         # ESLint
pnpm format       # Prettier 格式化
pnpm dev:infra    # 启动本地 PostgreSQL + Redis（需 Docker）
pnpm migrate      # 执行数据库迁移（需 DATABASE_URL）
pnpm seed         # 写入开发/封测数据
pnpm test:docs    # 协议一致性契约测试（docs/protocol.md ↔ 代码，CI 门禁）
pnpm test:e2e     # E2E 冒烟（需真实 PostgreSQL + Redis，见下）
```

> 本地依赖数据库时需要 Docker（`docker compose up -d postgres redis`）；迁移工具链在 CI 中以 PostgreSQL 服务验证。
> E2E：先 `pnpm dev:infra` 起 pg/redis，再 `pnpm test:e2e`；CI 的 `e2e` 作业自动提供服务容器。
> 部署：`docker-compose.prod.yml` + `.github/workflows/deploy.yml`（GHCR 镜像 + SSH），激活见 `deploy/README.md`。

## 仓库约定

- 项目文档集中于 [`docs/`](docs/)。
- 面向外部阅读的 Markdown 文档使用统一标题与层级格式。
- 代码、内容包、数据库迁移与部署配置进入版本控制。
- 不提交密钥、真实账号信息、环境变量文件或数据库备份。
