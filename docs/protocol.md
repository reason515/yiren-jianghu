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

## WS 事件
state.sync
combat.event
afk.status
afk.report
pvp.report
```

# 3. 约定

- 路由行格式：`METHOD /path`；需要鉴权的路由以 `(auth)` 标注（不影响解析）。
- 事件行格式：小写字母、数字、点、下划线、连字符。
- 客户端/服务端共用类型以 `@yjh/shared` 为唯一来源；本清单不得与 `EVENT_TYPES` 发散。
