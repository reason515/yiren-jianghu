<div align="center">

<span style="font-size: 28px;"><strong>客户端-服务端协议清单</strong></span><br/>
<span style="font-size: 18px;">机器可读，contract 测试强制与代码一致</span>

</div>

---

# 1. 说明

本清单是 HTTP 路由与 WS 事件声明的**唯一人工维护入口**。任何新增/删除路由或事件，必须同步更新 `# 2` 清单；`services/api/src/protocol.contract.test.ts` 会强制校验：

- 清单中的每条路由必须已被应用注册（`app.hasRoute`）；
- 清单中的 `protocolVersion` 必须与 `@yjh/shared` 的 `PROTOCOL_VERSION` 一致；
- 清单中的事件集合必须与 `@yjh/shared` 的 `EVENT_TYPES` 完全一致。

新增路由/事件后若不同步本文件，CI 会失败。

# 2. 机器可读清单

```text
protocolVersion: 1

## HTTP 路由
GET /health
GET /ready
GET /private (auth)
POST /auth/login
POST /auth/logout (auth)
GET /session/resume (auth)
GET /account (auth)
GET /characters/me (auth)
POST /characters (auth)
POST /characters/discard (auth)
PUT /characters/name (auth)
GET /scene (auth)
POST /scene/action (auth)
GET /inventory (auth)
POST /inventory/equip (auth)
POST /inventory/unequip (auth)
POST /inventory/use (auth)
GET /skills (auth)
POST /skills/learn (auth)
POST /skills/practice (auth)
GET /quests (auth)
POST /quests/accept (auth)
POST /quests/report (auth)
GET /templates (auth)
POST /templates (auth)
PUT /templates/:id (auth)
DELETE /templates/:id (auth)
POST /afk/start (auth)
POST /afk/stop (auth)
GET /afk/status (auth)
GET /afk/reports (auth)
GET /pvp/season (auth)
GET /pvp/opponents (auth)
POST /pvp/match (auth)
GET /pvp/matches/:id (auth)
GET /leaderboard/growth
GET /leaderboard/season
GET /forum/sections
GET /forum/posts
GET /forum/posts/:id
POST /forum/posts (auth)
POST /forum/posts/:id/comments (auth)
POST /forum/likes (auth)
POST /forum/reports (auth)
GET /content/version

## WS 事件
state.sync
scene.update
player.vitals
inv.update
skills.update
quest.status
combat.event
afk.status
afk.report
pvp.report
```

# 3. 重连与恢复协议

客户端意外断线后：

1. 客户端重连 WebSocket，携带会话 token（`Authorization: Bearer <token>`）。
2. 调用 `GET /session/resume` 获取恢复点：
   - `stateVersion`：当前状态版本号（用于增量同步判断）；
   - `character`：角色快照（`CharacterSnapshot`，含 vitals/位置/状态）；
   - `pendingAfkReports`：断线期间完成的挂机战报（未读结算）；
   - `pendingPvpReportIds`：断线期间完成的 PVP 战报 id。
3. 服务端随后按 WS 事件流推送补发（`state.sync` 全量 → 增量事件）。
4. 已启动的挂机作业由服务端继续结算，不依赖客户端在线。

# 4. 约定

- 路由行格式：`METHOD /path`；需要鉴权的路由以 `(auth)` 标注（不影响解析）。
- 事件行格式：小写字母、数字、点、下划线、连字符。
- 客户端/服务端共用类型与编解码以 `@yjh/shared` 为唯一来源（`codec.ts`：`eventEnvelopeSchema` / `sessionResumeSchema`）；本清单不得与 `EVENT_TYPES` 发散。
- 未实现 API 返回 `501 { error: { code: "not_implemented" } }`，B/E 阶段按 `services/api/src/apiManifest.ts` 的 domain 逐个落地。
