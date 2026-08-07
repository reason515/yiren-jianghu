import { describe, expect, it } from "vitest";
import { toCharacterView, type CharacterProfile } from "./characterTypes.js";

const PROFILE: CharacterProfile = {
  id: "char_1",
  name: "陆小风",
  gender: "male",
  exp: 1200,
  effectivePotential: 88,
  silver: 25,
  attrs: {
    str: { cur: 25, base: 20 },
    int: { cur: 20, base: 20 },
    con: { cur: 20, base: 20 },
    dex: { cur: 15, base: 20 },
  },
  vitals: { qi: 92, jing: 84, jingli: 70, neili: 20, food: 230, water: 260 },
};

describe("toCharacterView", () => {
  it("合并角色、武功与行囊快照，并从佩挂物派生装备槽", () => {
    const view = toCharacterView(
      PROFILE,
      [
        {
          id: "xuanmen_force",
          name: "玄门内功",
          category: "force",
          level: 12,
          maxLevel: 300,
          practicePoints: 4,
        },
      ],
      [
        { id: "it_sword", name: "铁剑", kind: "weapon", quantity: 1, equipped: true },
        { id: "it_unknown", name: "旧纸页", kind: "unknown", quantity: 1, equipped: false },
      ],
    );

    expect(view.skills[0]).toMatchObject({ category: "force", level: 12 });
    expect(view.equipment).toEqual([
      { slot: "weapon", item: { id: "it_sword", name: "铁剑" } },
      { slot: "armor" },
    ]);
    expect(view.inventory[1]?.kind).toBe("misc");
  });
});
