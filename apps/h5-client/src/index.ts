/**
 * H5 客户端（任务 E 阶段实现，Taro + React）。
 * 本文件仅为单仓骨架占位。
 */
import { PROTOCOL_VERSION } from "@yjh/shared";

export const CLIENT_NAME = "yjh-h5";
export const CLIENT_PROTOCOL_VERSION = PROTOCOL_VERSION;

export * from "./components/base/index.js";
export * from "./components/ConfirmSheet.js";
export * from "./components/AttributeAllocator.js";
export * from "./components/LoginPage.js";
export * from "./components/CharacterCreateSheet.js";
export * from "./components/SceneView.js";
export * from "./components/ExitPad.js";
export * from "./components/EntitySheet.js";
export * from "./components/CombatView.js";
export * from "./components/CharacterSheet.js";
export * from "./components/TacticEditor.js";
export * from "./components/GrindBanner.js";
export * from "./components/AfkSheet.js";
export * from "./components/AfkReportView.js";
export * from "./components/QuestPanel.js";
export * from "./lib/authApi.js";
export * from "./lib/sceneTypes.js";
export * from "./lib/combatTypes.js";
export * from "./lib/characterTypes.js";
export * from "./lib/tacticTypes.js";
export * from "./lib/afkTypes.js";
export * from "./lib/questTypes.js";
