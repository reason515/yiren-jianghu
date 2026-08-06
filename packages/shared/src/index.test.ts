import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION } from "./index.js";

describe("shared protocol", () => {
  it("exposes a stable protocol version", () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });
});
