import { describe, expect, it } from "vitest";
import { createAppMeta } from "./index.js";

describe("api", () => {
  it("builds app meta with protocol version", () => {
    expect(createAppMeta().name).toBe("api");
    expect(createAppMeta().protocolVersion).toBe(1);
  });
});
