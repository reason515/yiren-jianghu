import { describe, expect, it } from "vitest";
import { decodeEvent, encodeEvent, eventEnvelopeSchema } from "./codec.js";
import { EVENT_TYPES, PROTOCOL_VERSION } from "./index.js";

describe("shared codec", () => {
  it("encode/decode round trip preserves type and data", () => {
    const raw = encodeEvent("combat.event", { text: "你一招青龙摆尾，正中敌人胸口。" });
    const env = decodeEvent(raw);
    expect(env.v).toBe(PROTOCOL_VERSION);
    expect(env.type).toBe("combat.event");
    expect(env.data).toEqual({ text: "你一招青龙摆尾，正中敌人胸口。" });
  });

  it("rejects unknown event types", () => {
    expect(() => eventEnvelopeSchema.parse({ v: 1, type: "not_an_event" })).toThrow();
  });

  it("rejects wrong protocol version", () => {
    expect(() => eventEnvelopeSchema.parse({ v: 99, type: EVENT_TYPES[0] })).toThrow();
  });
});
