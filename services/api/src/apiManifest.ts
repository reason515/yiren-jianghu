/**
 * HTTP API 清单（B2，唯一清单）。
 * 与 docs/protocol.md「HTTP 路由」保持一致：新增/修改 API 必须同步三处——
 * 代码（此处 + 实现）、docs/protocol.md、@yjh/shared 相关类型。
 * B/E 阶段按 domain 逐个实现：实现真实路由后注册进 app，stub 会因 hasRoute 跳过。
 */
export interface ApiRoute {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  auth: boolean;
  domain:
    | "auth"
    | "account"
    | "character"
    | "scene"
    | "inventory"
    | "skills"
    | "quests"
    | "templates"
    | "afk"
    | "pvp"
    | "leaderboard"
    | "forum"
    | "content"
    | "session"
    | "combat";
}

export const API_MANIFEST: ApiRoute[] = [
  // 认证与会话
  { method: "POST", path: "/auth/login", auth: false, domain: "auth" },
  { method: "POST", path: "/auth/logout", auth: true, domain: "auth" },
  { method: "GET", path: "/session/resume", auth: true, domain: "session" },
  // 账号与角色
  { method: "GET", path: "/account", auth: true, domain: "account" },
  { method: "GET", path: "/characters/me", auth: true, domain: "character" },
  { method: "POST", path: "/characters", auth: true, domain: "character" },
  { method: "POST", path: "/characters/discard", auth: true, domain: "character" },
  { method: "PUT", path: "/characters/name", auth: true, domain: "character" },
  // 场景与探索
  { method: "GET", path: "/scene", auth: true, domain: "scene" },
  { method: "POST", path: "/scene/action", auth: true, domain: "scene" },
  // 物品与装备
  { method: "GET", path: "/inventory", auth: true, domain: "inventory" },
  { method: "POST", path: "/inventory/equip", auth: true, domain: "inventory" },
  { method: "POST", path: "/inventory/unequip", auth: true, domain: "inventory" },
  { method: "POST", path: "/inventory/use", auth: true, domain: "inventory" },
  // 技能成长
  { method: "GET", path: "/skills", auth: true, domain: "skills" },
  { method: "POST", path: "/skills/learn", auth: true, domain: "skills" },
  { method: "POST", path: "/skills/practice", auth: true, domain: "skills" },
  { method: "POST", path: "/skills/study", auth: true, domain: "skills" },
  // 任务
  { method: "GET", path: "/quests", auth: true, domain: "quests" },
  { method: "POST", path: "/quests/accept", auth: true, domain: "quests" },
  { method: "POST", path: "/quests/report", auth: true, domain: "quests" },
  // PVE 战斗
  { method: "POST", path: "/combat/start", auth: true, domain: "combat" },
  { method: "POST", path: "/combat/action", auth: true, domain: "combat" },
  { method: "GET", path: "/combat/status", auth: true, domain: "combat" },
  // 战术模板
  { method: "GET", path: "/templates", auth: true, domain: "templates" },
  { method: "POST", path: "/templates", auth: true, domain: "templates" },
  { method: "PUT", path: "/templates/:id", auth: true, domain: "templates" },
  { method: "DELETE", path: "/templates/:id", auth: true, domain: "templates" },
  // 挂机
  { method: "POST", path: "/afk/start", auth: true, domain: "afk" },
  { method: "POST", path: "/afk/stop", auth: true, domain: "afk" },
  { method: "GET", path: "/afk/status", auth: true, domain: "afk" },
  { method: "GET", path: "/afk/reports", auth: true, domain: "afk" },
  // 异步 PVP
  { method: "GET", path: "/pvp/season", auth: true, domain: "pvp" },
  { method: "GET", path: "/pvp/opponents", auth: true, domain: "pvp" },
  { method: "POST", path: "/pvp/match", auth: true, domain: "pvp" },
  { method: "GET", path: "/pvp/matches/:id", auth: true, domain: "pvp" },
  // 排行榜
  { method: "GET", path: "/leaderboard/growth", auth: false, domain: "leaderboard" },
  { method: "GET", path: "/leaderboard/season", auth: false, domain: "leaderboard" },
  // 论坛
  { method: "GET", path: "/forum/sections", auth: false, domain: "forum" },
  { method: "GET", path: "/forum/posts", auth: false, domain: "forum" },
  { method: "GET", path: "/forum/posts/:id", auth: false, domain: "forum" },
  { method: "POST", path: "/forum/posts", auth: true, domain: "forum" },
  { method: "POST", path: "/forum/posts/:id/comments", auth: true, domain: "forum" },
  { method: "POST", path: "/forum/likes", auth: true, domain: "forum" },
  { method: "POST", path: "/forum/reports", auth: true, domain: "forum" },
  // 内容
  { method: "GET", path: "/content/version", auth: false, domain: "content" },
];
