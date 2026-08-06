/**
 * 游戏核心规则引擎（纯 TS、零 IO、确定性可复现）。
 * 后续任务：C1 数值参数表、C2 Vitals、C3 战斗引擎、C4 绝招、C5 技能成长、
 * C6 战术模板、C7 挂机作业、C8 PVP、C9 经济掉落、C10 地图导航。
 */
import { PROTOCOL_VERSION } from "@yjh/shared";

export const GAME_CORE_VERSION = `core-${PROTOCOL_VERSION}`;

export { PROTOCOL_VERSION };
export * from "./params.js";
export * from "./vitals.js";
export * from "./random.js";
export * from "./combat.js";
export * from "./perform.js";
export * from "./growth.js";
export * from "./tactic.js";
export * from "./afk.js";
export * from "./pvp.js";
export * from "./economy.js";
