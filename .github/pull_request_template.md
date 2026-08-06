## 变更描述

<!-- 简述本次改动做了什么、为什么 -->

## 关联

- 计划任务：<!-- 如 A3 / C1，见 docs/design-and-development-plan.md -->
- 内容筛选条目：<!-- 如涉及 pkuxkx 内容，标注 docs/pkuxkx-content-catalog.md 条目 -->

## 检查清单

- [ ] `pnpm build` 通过
- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test` 通过（新增/修改逻辑有单测）
- [ ] 行为变化已同步**三件套**：代码 / 测试 / 文档（新增或修改 API 路由或 WS 事件时，同步更新 `docs/protocol.md`，`pnpm test:docs` 必须绿）
- [ ] `pnpm lint` 与 `pnpm format:check` 通过
- [ ] 涉及数据库结构时附带迁移文件
- [ ] 涉及客户端-服务端交互时更新协议类型（`@yjh/shared`）与 `docs/protocol.md`
- [ ] 涉及 pkuxkx 内容时已登记权利状态（机制借鉴/需改写/需授权）
- [ ] 文档（README / docs）已同步
