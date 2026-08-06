/** 客户端与服务端共用的协议版本与基础类型。 */

export const PROTOCOL_VERSION = 1;

/** 协议 v1 的事件类型（与 docs/protocol.md 清单保持一致的唯一来源，contract 测试强制同步）。 */
export const EVENT_TYPES = [
  "state.sync",
  "combat.event",
  "afk.status",
  "afk.report",
  "pvp.report",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/** 简单 JSON 值类型。 */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
