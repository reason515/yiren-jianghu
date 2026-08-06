import { describe, expect, it } from "vitest";
import { GAME_CORE_VERSION, PROTOCOL_VERSION } from "./index.js";

describe("game-core", () => {
  it("links workspace dependency @yjh/shared", () => {
    expect(GAME_CORE_VERSION).toBe(`core-${PROTOCOL_VERSION}`);
  });
});
