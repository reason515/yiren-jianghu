/** API 元信息（供健康检查与测试断言使用）。 */
import { PROTOCOL_VERSION } from "@yjh/shared";

export interface AppMeta {
  name: "api";
  protocolVersion: number;
}

export function createAppMeta(): AppMeta {
  return { name: "api", protocolVersion: PROTOCOL_VERSION };
}
