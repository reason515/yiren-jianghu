import { z } from "zod";
import { EVENT_TYPES, PROTOCOL_VERSION } from "./index.js";

/**
 * 协议编解码（zod，服务端与客户端共用）。
 * 跨边界载荷（WS 事件信封、重连恢复响应）在此定义唯一 Schema，保证两端一致。
 * 业务 DTO 的详细 Schema 随各域（角色/场景/战斗/挂机/PVP/论坛）落地时补充。
 */

export const eventEnvelopeSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.enum(EVENT_TYPES),
  data: z.record(z.string(), z.unknown()).optional(),
});

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;

/** 断线重连恢复响应 Schema（E 阶段补齐字段级校验；此处先保结构）。 */
export const sessionResumeSchema = z.object({
  stateVersion: z.number().int().nonnegative(),
  character: z.unknown().nullable(),
  pendingAfkReports: z.array(z.unknown()),
  pendingPvpReportIds: z.array(z.string()),
});

export type SessionResumeDecoded = z.infer<typeof sessionResumeSchema>;

export function decodeEvent(raw: string): EventEnvelope {
  return eventEnvelopeSchema.parse(JSON.parse(raw));
}

export function encodeEvent(type: EventEnvelope["type"], data?: EventEnvelope["data"]): string {
  const envelope: EventEnvelope =
    data === undefined ? { v: PROTOCOL_VERSION, type } : { v: PROTOCOL_VERSION, type, data };
  return JSON.stringify(envelope);
}
