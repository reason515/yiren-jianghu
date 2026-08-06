/** 客户端与服务端共用的协议版本与基础类型。 */

export const PROTOCOL_VERSION = 1;
/**
 * 协议 v1 的事件类型（与 docs/protocol.md 清单保持一致的唯一来源，contract 测试强制同步）。
 * 新增事件：先在此追加，再同步 docs/protocol.md「WS 事件」清单。
 */
export const EVENT_TYPES = [
  "state.sync",
  "scene.update",
  "player.vitals",
  "inv.update",
  "skills.update",
  "quest.status",
  "combat.event",
  "afk.status",
  "afk.report",
  "pvp.report",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/** 简单 JSON 值类型。 */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** 角色状态（与数据库 characters.status 一致）。 */
export type CharacterStatus = "active" | "discarded" | "frozen";

/** 基础状态：服务端权威，前端只读展示。 */
export interface Vitals {
  qi: number;
  maxQi: number;
  effQi: number;
  jing: number;
  maxJing: number;
  effJing: number;
  jingli: number;
  maxJingli: number;
  neili: number;
  maxNeili: number;
  food: number;
  maxFood: number;
  water: number;
  maxWater: number;
}

/** 四维：当前 / 先天。 */
export interface AttrValues {
  cur: number;
  base: number;
}

export interface Attrs {
  str: AttrValues;
  int: AttrValues;
  con: AttrValues;
  dex: AttrValues;
}

/** 角色快照（重连恢复 / PVP 快照的基础结构）。 */
export interface CharacterSnapshot {
  id: string;
  name: string;
  gender: "male" | "female";
  status: CharacterStatus;
  attrs: Attrs;
  exp: number;
  potential: number;
  learnedPoints: number;
  silver: number;
  vitals: Vitals;
  roomPath: string;
  safeRoomId: string;
  currentContentVersion: string;
}

/** 挂机战报摘要（断线后未读结算）。 */
export interface AfkReportSummary {
  jobId: string;
  kind: string;
  status: "completed" | "failed" | "cancelled";
  stopReason?: string;
  finishedAt: string;
}

/** 断线重连恢复响应（GET /session/resume）。 */
export interface SessionResumeResponse {
  stateVersion: number;
  character: CharacterSnapshot | null;
  pendingAfkReports: AfkReportSummary[];
  pendingPvpReportIds: string[];
}
