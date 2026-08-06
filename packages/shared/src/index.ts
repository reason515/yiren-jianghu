/** 客户端与服务端共用的协议版本与基础类型。 */

export const PROTOCOL_VERSION = 1;

/** 协议 v1 的事件类型（占位，B2 任务扩展）。 */
export type EventType = "state.sync" | "combat.event" | "afk.status" | "afk.report" | "pvp.report";

/** 简单 JSON 值类型。 */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
