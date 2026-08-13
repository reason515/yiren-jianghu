import { describe, expect, it } from "vitest";
import type { ContentPack } from "@yjh/content";
import { DEFAULT_PARAMS } from "./params.js";
import { effectiveLevel } from "./enable.js";
import { resolveEnableMap } from "./combatantFactory.js";

const CONTENT = {
  manifest: { version: "0.0.0", name: "test" },
  params: DEFAULT_PARAMS,
  rooms: [],
  npcs: [],
  items: [],
  skills: [
    {
      id: "basic_force",
      name: "基本内功",
      kind: "basic",
      category: "force",
      enableSlots: [],
      maxLevel: 200,
      baseLevel: 0,
    },
    {
      id: "xuanmen_force",
      name: "玄门内功",
      kind: "special",
      category: "force",
      enableSlots: ["force"],
      maxLevel: 300,
      baseLevel: 0,
    },
  ],
  moves: [],
  performs: [],
  quests: [],
  story: [],
} as unknown as ContentPack;

describe("resolveEnableMap（DC-057）", () => {
  const levels = new Map([
    ["basic_force", 20],
    ["xuanmen_force", 40],
  ]);

  it("空存档按 auto 补齐", () => {
    expect(resolveEnableMap(CONTENT, levels, null).force).toBe("xuanmen_force");
    expect(resolveEnableMap(CONTENT, levels, {}).force).toBe("xuanmen_force");
  });

  it("显式 null 强制清空且保留 null，不被 auto 补回", () => {
    const resolved = resolveEnableMap(CONTENT, levels, { force: null });
    expect(resolved.force).toBeNull();
    expect(
      effectiveLevel(
        "force",
        {
          basic_force: {
            id: "basic_force",
            level: 20,
            kind: "basic",
            category: "force",
            enableSlots: [],
          },
          xuanmen_force: {
            id: "xuanmen_force",
            level: 40,
            kind: "special",
            category: "force",
            enableSlots: ["force"],
          },
        },
        resolved,
      ),
    ).toBe(10); // floor(20/2)+0
  });

  it("显式字符串覆盖 auto", () => {
    expect(resolveEnableMap(CONTENT, levels, { force: "xuanmen_force" }).force).toBe(
      "xuanmen_force",
    );
  });
});
