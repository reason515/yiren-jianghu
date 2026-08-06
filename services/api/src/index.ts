/**
 * API 服务（任务 A5 起实现）。
 * Fastify 应用工厂 createApp()，支持注入依赖便于测试。
 */
import { PROTOCOL_VERSION } from "@yjh/shared";

export interface AppMeta {
  name: "api";
  protocolVersion: number;
}

export function createAppMeta(): AppMeta {
  return { name: "api", protocolVersion: PROTOCOL_VERSION };
}
