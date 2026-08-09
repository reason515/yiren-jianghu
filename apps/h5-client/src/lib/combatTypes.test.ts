import { describe, expect, it } from "vitest";
import {
  battleEventLine,
  combatLineClassName,
  toCombatState,
  type CombatStatusResponse,
} from "./combatTypes.js";

const RESPONSE: CombatStatusResponse = {
  status: "ongoing",
  state: {
    combatants: {
      a: { name: "沈青崖", qi: 80, maxQi: 100, jing: 60, maxJing: 80, neili: 30, maxNeili: 50 },
      b: { name: "野狗", qi: 40, maxQi: 50, jing: 20, maxJing: 20, neili: 0, maxNeili: 0 },
    },
  },
  performs: [{ id: "swift_slash", name: "疾风斩", ready: true }],
  events: [
    { seq: 0, type: "battle_start", data: { seed: 42 } },
    { seq: 1, type: "perform", actor: "a", data: { performId: "swift_slash" } },
  ],
};

describe("toCombatState", () => {
  it("只适配服务端状态与事件，不在客户端推演战斗", () => {
    const state = toCombatState(RESPONSE);
    expect(state).toMatchObject({
      enemyName: "野狗",
      playerQi: 80,
      enemyQi: 40,
      inCombat: true,
      performs: [{ id: "swift_slash", ready: true }],
    });
    expect(state.log.map((line) => line.text).join("\n")).toContain("疾风斩");
    expect(state.log.some((line) => line.text.includes("你"))).toBe(true);
  });

  it("多敌状态列出全部敌人", () => {
    const state = toCombatState({
      status: "ongoing",
      state: {
        combatants: {
          a: { name: "沈青崖", qi: 80, maxQi: 100, jing: 60, maxJing: 80, neili: 30, maxNeili: 50 },
          b0: { name: "野狗", qi: 40, maxQi: 50, jing: 20, maxJing: 20, neili: 0, maxNeili: 0 },
          b1: { name: "瘦狗", qi: 0, maxQi: 40, jing: 10, maxJing: 10, neili: 0, maxNeili: 0 },
        },
        foeIds: ["b0", "b1"],
      },
      performs: [],
      events: [
        {
          seq: 0,
          type: "battle_start",
          data: { foeCount: 2, foeNames: ["野狗", "瘦狗"] },
        },
      ],
    });
    expect(state.enemies).toHaveLength(2);
    expect(state.enemies[1]).toMatchObject({ name: "瘦狗", down: true });
    expect(state.log[0]?.text).toContain("野狗");
    expect(state.log[0]?.kind).toBe("start");
  });

  it("结束战局收束结果与服务端奖励", () => {
    const state = toCombatState({
      ...RESPONSE,
      status: "finished",
      state: { ...RESPONSE.state, winner: "a" },
      events: [
        ...RESPONSE.events,
        {
          seq: 2,
          type: "reward",
          actor: "a",
          data: { exp: 6, potential: 2, silver: 3, drops: [{ itemId: "dry_food", count: 1 }] },
        },
      ],
    });
    expect(state).toMatchObject({
      inCombat: false,
      result: "win",
      reward: { exp: 6, potential: 2, silver: 3 },
    });
  });
});

describe("battleEventLine 武侠叙事与着色", () => {
  it("我方击中为 damage，敌方击中为 hurt", () => {
    const hit = battleEventLine(
      { seq: 3, type: "damage", actor: "a", data: { targetId: "b0" } },
      "沈青崖",
      "野狗",
      (actor) => (actor === "a" ? "沈青崖" : "野狗"),
    );
    expect(hit?.kind).toBe("damage");
    expect(hit?.text).toContain("你");
    expect(combatLineClassName(hit?.kind)).toContain("hit");

    const hurt = battleEventLine(
      { seq: 4, type: "damage", actor: "b0", data: { targetId: "a" } },
      "沈青崖",
      "野狗",
      (actor) => (actor === "a" ? "沈青崖" : "野狗"),
    );
    expect(hurt?.kind).toBe("hurt");
    expect(hurt?.text).toMatch(/疼|痛|紧|铁锈/);
    expect(combatLineClassName(hurt?.kind)).toContain("hurt");
  });

  it("绝招行带 perform 着色类", () => {
    const line = battleEventLine(
      { seq: 5, type: "perform", actor: "a", data: { performId: "疾风斩", targetId: "b0" } },
      "沈青崖",
      "野狗",
    );
    expect(line?.kind).toBe("perform");
    expect(line?.text).toContain("疾风斩");
    expect(combatLineClassName("perform")).toBe(" hl");
  });
});
