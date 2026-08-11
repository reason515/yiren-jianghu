import { describe, expect, it } from "vitest";
import {
  battleEventLine,
  combatLineClassName,
  toCombatState,
  type CombatStatusResponse,
} from "./combatTypes.js";
import { inferNature, damageBand, combatTier } from "./combatNarrative.js";

const RESPONSE: CombatStatusResponse = {
  status: "ongoing",
  state: {
    combatants: {
      a: {
        name: "沈青崖",
        qi: 80,
        maxQi: 100,
        jing: 60,
        maxJing: 80,
        neili: 30,
        maxNeili: 50,
        nature: "human",
        stats: { attack: 12, defense: 8, dodge: 5, parry: 5, weaponLevel: 3, forceLevel: 2 },
      },
      b: {
        name: "野狗",
        qi: 40,
        maxQi: 50,
        jing: 20,
        maxJing: 20,
        neili: 0,
        maxNeili: 0,
        nature: "beast",
        stats: { attack: 6, defense: 2, dodge: 4, parry: 0, weaponLevel: 0, forceLevel: 0 },
      },
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
          b0: {
            name: "野狗",
            qi: 40,
            maxQi: 50,
            jing: 20,
            maxJing: 20,
            neili: 0,
            maxNeili: 0,
            nature: "beast",
          },
          b1: {
            name: "瘦狗",
            qi: 0,
            maxQi: 40,
            jing: 10,
            maxJing: 10,
            neili: 0,
            maxNeili: 0,
            nature: "beast",
          },
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
    expect(state.log[0]?.text).toMatch(/低吼|群畜|涎水/);
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

  it("每个回合结束后插入空行分隔", () => {
    const state = toCombatState({
      ...RESPONSE,
      events: [
        { seq: 0, type: "battle_start", data: {} },
        { seq: 1, type: "turn_start", data: { turn: 1 } },
        { seq: 2, type: "damage", actor: "a", data: { targetId: "b", damage: 5 } },
        { seq: 3, type: "turn_start", data: { turn: 2 } },
        { seq: 4, type: "damage", actor: "b", data: { targetId: "a", damage: 4 } },
      ],
    });
    const spacerAt = state.log.findIndex((line) => line.kind === "spacer");
    expect(spacerAt).toBeGreaterThan(0);
    expect(state.log[spacerAt]?.text).toBe("");
    expect(combatLineClassName("spacer")).toBe(" spacer");
  });

  it("玩家动作与敌还手之间插入 exchange，并挂上 HUD 增量", () => {
    const state = toCombatState({
      ...RESPONSE,
      events: [
        { seq: 0, type: "battle_start", data: {} },
        { seq: 1, type: "turn_start", data: { turn: 1 } },
        { seq: 2, type: "damage", actor: "a", data: { targetId: "b", damage: 8 } },
        { seq: 3, type: "dodge", actor: "b", data: { targetId: "a" } },
      ],
    });
    const exchangeAt = state.log.findIndex((line) => line.kind === "exchange");
    expect(exchangeAt).toBeGreaterThan(0);
    expect(combatLineClassName("exchange")).toBe(" exchange");
    const hit = state.log.find((line) => line.kind === "damage");
    expect(hit?.actorId).toBe("a");
    expect(hit?.hud).toEqual({ qiById: { b: -8 } });
  });
});

describe("battleEventLine 关键字着色与兽性", () => {
  const beastOf = (actor: string | undefined) => {
    if (actor === "a") {
      return {
        name: "沈青崖",
        nature: "human" as const,
        stats: { attack: 12, defense: 8, dodge: 5, parry: 5, weaponLevel: 3, forceLevel: 2 },
        maxQi: 100,
      };
    }
    return {
      name: "野狗",
      nature: "beast" as const,
      stats: { attack: 6, defense: 2, dodge: 4, parry: 0, weaponLevel: 0, forceLevel: 0 },
      maxQi: 50,
    };
  };

  it("击中行只给关键字 mark，非整行 hit class", () => {
    const hit = battleEventLine(
      { seq: 3, type: "damage", actor: "a", data: { targetId: "b", damage: 8 } },
      "沈青崖",
      "野狗",
      (actor) => (actor === "a" ? "沈青崖" : "野狗"),
      beastOf,
    );
    expect(hit?.kind).toBe("damage");
    expect(hit?.segments?.some((s) => s.mark === "hit")).toBe(true);
    expect(combatLineClassName(hit?.kind)).toBe("");
  });

  it("野兽击中玩家用咬/扑/抓，并标 hurt 关键字", () => {
    const hurt = battleEventLine(
      { seq: 4, type: "damage", actor: "b", data: { targetId: "a", damage: 10 } },
      "沈青崖",
      "野狗",
      (actor) => (actor === "a" ? "沈青崖" : "野狗"),
      beastOf,
    );
    expect(hurt?.kind).toBe("hurt");
    expect(hurt?.text).toMatch(/咬|扑|抓|撕/);
    expect(hurt?.segments?.some((s) => s.mark === "hurt")).toBe(true);
    expect(combatLineClassName(hurt?.kind)).toBe("");
  });

  it("闪避行关键字着色", () => {
    const dodge = battleEventLine(
      { seq: 5, type: "dodge", actor: "b", data: { targetId: "a" } },
      "沈青崖",
      "野狗",
      (actor) => (actor === "a" ? "沈青崖" : "野狗"),
      beastOf,
    );
    expect(dodge?.kind).toBe("dodge");
    expect(dodge?.segments?.some((s) => s.mark === "dodge")).toBe(true);
  });

  it("绝招名单独 perform 着色，整行不再 hl", () => {
    const line = battleEventLine(
      { seq: 6, type: "perform", actor: "a", data: { performId: "疾风斩", targetId: "b" } },
      "沈青崖",
      "野狗",
      undefined,
      beastOf,
    );
    expect(line?.kind).toBe("perform");
    expect(line?.text).toContain("疾风斩");
    expect(line?.segments?.some((s) => s.mark === "perform" && s.text === "疾风斩")).toBe(true);
    expect(combatLineClassName("perform")).toBe("");
  });

  it("偶数回合 turn_start 注入击间闲笔", () => {
    const line = battleEventLine(
      { seq: 8, type: "turn_start", data: { turn: 2 } },
      "沈青崖",
      "野狗",
      (actor) => (actor === "a" ? "沈青崖" : "野狗"),
      beastOf,
    );
    expect(line).not.toBeNull();
    expect(line?.text).toMatch(/盯|破绽|脚步|低吼|扑|移/);
    expect(
      battleEventLine({ seq: 9, type: "turn_start", data: { turn: 3 } }, "沈青崖", "野狗"),
    ).toBe(null);
  });
});

describe("narrative helpers", () => {
  it("从名称推断兽性", () => {
    expect(inferNature("野狗")).toBe("beast");
    expect(inferNature("城门守卫")).toBe("human");
    expect(inferNature("铁翅雕")).toBe("bird");
  });

  it("伤害分档与境界", () => {
    expect(damageBand(3, 50)).toBe("light");
    expect(damageBand(20, 50)).toBe("heavy");
    expect(
      combatTier({ attack: 50, defense: 0, dodge: 0, parry: 0, weaponLevel: 0, forceLevel: 0 }),
    ).toBe("high");
  });
});
