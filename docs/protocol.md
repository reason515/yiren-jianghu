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
GET /map (auth)
GET /scene (auth)
POST /scene/action (auth)
GET /inventory (auth)
POST /inventory/equip (auth)
POST /inventory/unequip (auth)
POST /inventory/use (auth)
GET /skills (auth)
POST /skills/learn (auth)
POST /skills/practice (auth)
POST /skills/study (auth)
GET /quests (auth)
POST /quests/accept (auth)
POST /quests/report (auth)
POST /combat/start (auth)
POST /combat/action (auth)
GET /combat/status (auth)
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

# 5. PVE 战斗约定

- `POST /combat/start` 请求 `{ targetIds: string[] }`（1–5 个，须均在当前房间且为 `battle` NPC）；兼容旧字段 `{ targetId }`（视作单元素）。主目标为数组首项（写入 `target_def_id`）；同房 `battleAllies` 由服务端在开战时并入（DC-038）。
- `POST /combat/action` 仅接收 `{ action: "attack" | "recover" | "flee" }`，或 `{ action: "perform", performId, targetId? }`。可选 `targetId` 为敌方槽位键（如 `b0`）；缺省打当前气最低的存活敌人。客户端不提交绝招效果、消耗、冷却或收益。手动战客户端可按节拍自动提交 `attack`（DC-037），绝招须玩家触发。
- 战斗状态 `combatants` 含玩家 `a` 与敌方 `b0`…；`foeIds` 有序列出敌方键。事件 `actor` 为上述键，伤害类 `data.targetId` 标明受击者。旧会话仅有 `a`/`b` 时服务端按 `foeIds:["b"]` 兼容。
- 服务端在会话 `state` 中保存 RNG 调用计数与绝招冷却；每次 action 返回完整有序事件流。`perform` 事件携带 `performId`，便于客户端演出。
- 胜利时服务端按 NPC 内容包 `battleRewards` / `drops` 结算，并在事件流追加 `reward`；若命中当前任务 kill 相位，再追加 `quest_progress`（DC-023、DC-024）。

# 6. 任务总览约定

- `GET /quests` 返回 `{ quests, story }`：`quests` 是任务状态与相位进度，`story` 是服务端按内容包与任务记录组装的主线足迹；客户端不得自行推演任务状态。
- 相位返回 `targetName`（玩家可见目标名）及可选 `targetRoomId`（导航指向）；客户端不得展示内部 `targetId`。
- 移动抵达出口房间时，服务端调用任务进度钩子推进当前 `goto` 相位；击杀相位由战斗域推进。

# 7. 场景交互约定

`POST /scene/action` 按 `type` 接收受控意图：

- `move { dir }`：移动；返回抵达后的场景。
- `talk { targetId }`：仅可与当前房间 NPC 交谈；返回内容包对话，并由服务端推进当前 `talk` 任务相位。
- `take { targetId }`：仅可拾取当前房间物品；每个角色对同一房间物品仅成功一次，返回所得物品。
- `observe { targetId }`（V2.12 / V2.16）：观察当前房间 NPC/物品。物品返回外观 `description`（及单行 `lines`）。NPC 由服务端拼装多行仪容：`lines` 依次为外形（内容包 `description`）、武功水平（取技能最高等级阶位；无有效武学时战斗怪用野性补句、其余「气息寻常」）、衣着/兵器（内容包 `equipment` 解析为 weapon/armor 物品名；无装备则不写空衣甲，以免与外形文案打架）。`description` 字段为 `lines` 换行拼接，供兼容；客户端宜按 `lines` 串行入见闻。只读不改状态。
- `trade { targetId }`：仅可向当前房间商贩打开交易快照，返回服务端银两、内容包报价及行囊。
- `buy` / `sell { targetId, itemId, count }`：商贩和物品均由服务端验证；扣款/入囊或扣物/入银两与每日回收额度在同一事务结算。

**自然恢复（V2.12，参照 pkuxkx 时间恢复）**：`GET /scene`、移动、场景交互时，服务端按距 `characters.last_heal_at` 的时间差结算 qi/jing/jingli/neili 恢复（每分钟为上限的 `params.regen.qiPerMin` 等比例），单次封顶 `maxWindowMinutes` 防离线累积；食水不自动恢复。

客户端不得提交价格、银两余额、物品定义或结算结果；`targetId` / `itemId` 仅作服务端校验所需的内部引用，不在玩家界面展示（DC-025）。
