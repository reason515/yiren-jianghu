import { describe, expect, it, beforeEach } from "vitest";
import {
  inferBeastKind,
  inferNature,
  narrateBattleEvent,
  pickVariant,
  resetNarrativePickMemory,
  type BattleLineOptions,
  type NarrativeCombatant,
} from "./combatNarrative.js";

const combatants: Record<string, NarrativeCombatant> = {
  a: { name: "沈青崖", nature: "human" },
  b: { name: "野狗", nature: "beast" },
  snake: { name: "青蛇", nature: "beast" },
};

const options: BattleLineOptions = {
  names: (actor) => {
    if (!actor || actor === "a") return "沈青崖";
    return combatants[actor]?.name ?? "对手";
  },
  combatantOf: (actor) => {
    if (!actor) return undefined;
    if (actor === "a") return combatants.a;
    return combatants[actor];
  },
};

beforeEach(() => {
  resetNarrativePickMemory();
});

describe("inferBeastKind", () => {
  it("按名字细分狗狼与蛇", () => {
    expect(inferBeastKind("野狗")).toBe("canine");
    expect(inferBeastKind("灰狼")).toBe("canine");
    expect(inferBeastKind("青蛇")).toBe("serpentine");
    expect(inferBeastKind("巨蟒")).toBe("serpentine");
    expect(inferBeastKind("老虎")).toBe("generic");
    expect(inferNature("青蛇")).toBe("beast");
  });
});

describe("攻防闭环与兽性词库", () => {
  it("parry + 守方 beast：可用肩爪牙颈，禁肘/虎口/腕/架势/衣角", () => {
    const texts: string[] = [];
    for (let seq = 1; seq <= 12; seq += 1) {
      const line = narrateBattleEvent(
        { seq, type: "parry", actor: "a", data: { targetId: "b" } },
        "沈青崖",
        "野狗",
        options,
      );
      expect(line).not.toBeNull();
      texts.push(line!.text);
      expect(line!.text).toMatch(/肩|爪|牙|颈|身躯|偏头|头颈/);
      expect(line!.text).not.toMatch(/肘|虎口|腕|架势|衣角/);
      expect(line!.text).toMatch(/你/);
      expect(line!.text).toMatch(/野狗/);
    }
    expect(texts.some((t) => /硬扛|硬接|挡下|扛住|顶开/.test(t))).toBe(true);
  });

  it("dodge + 人攻兽闪：无衣角，且含起手与躲开", () => {
    for (let seq = 1; seq <= 10; seq += 1) {
      const line = narrateBattleEvent(
        { seq, type: "dodge", actor: "a", data: { targetId: "b" } },
        "沈青崖",
        "野狗",
        options,
      );
      expect(line).not.toBeNull();
      expect(line!.text).not.toContain("衣角");
      expect(line!.text).toMatch(/你/);
      expect(line!.text).toMatch(/野狗/);
      expect(line!.text).toMatch(/空|躲|闪|让|晃|滚/);
    }
  });

  it("dodge + 兽攻人闪：含扑/爪等，主语关系正确", () => {
    const line = narrateBattleEvent(
      { seq: 3, type: "dodge", actor: "b", data: { targetId: "a" } },
      "沈青崖",
      "野狗",
      options,
    );
    expect(line).not.toBeNull();
    expect(line!.text).toMatch(/扑|爪|牙|咬/);
    expect(line!.text).toMatch(/你/);
    expect(line!.text).toMatch(/野狗/);
    expect(line!.text).not.toMatch(/衣角|架势|虎口/);
  });

  it("名字含蛇：招架/命中用缠鳞信等，不用肘", () => {
    const snakeOpts: BattleLineOptions = {
      names: (actor) => (actor === "a" || !actor ? "沈青崖" : "青蛇"),
      combatantOf: (actor) => {
        if (actor === "a") return combatants.a;
        if (actor === "snake") return combatants.snake;
        return undefined;
      },
    };
    const parry = narrateBattleEvent(
      { seq: 2, type: "parry", actor: "a", data: { targetId: "snake" } },
      "沈青崖",
      "青蛇",
      snakeOpts,
    );
    expect(parry).not.toBeNull();
    expect(parry!.text).toMatch(/鳞|身躯|尾|信|盘/);
    expect(parry!.text).not.toMatch(/肘|虎口|腕|架势|衣角/);

    const hit = narrateBattleEvent(
      { seq: 4, type: "damage", actor: "a", data: { targetId: "snake", damage: 8 } },
      "沈青崖",
      "青蛇",
      {
        ...snakeOpts,
        combatantOf: (actor) => {
          const base = snakeOpts.combatantOf?.(actor);
          if (!base) return undefined;
          return { ...base, maxQi: 40 };
        },
      },
    );
    expect(hit).not.toBeNull();
    expect(hit!.text).not.toMatch(/肘|虎口|架势|衣角/);
  });
});

describe("模板去重", () => {
  it("同 seed 序列下连续同类型不全文相等", () => {
    resetNarrativePickMemory();
    const texts: string[] = [];
    for (let seq = 1; seq <= 6; seq += 1) {
      const line = narrateBattleEvent(
        { seq, type: "parry", actor: "a", data: { targetId: "b" } },
        "沈青崖",
        "野狗",
        options,
      );
      texts.push(line!.text);
    }
    const unique = new Set(texts);
    expect(unique.size).toBeGreaterThan(1);
  });

  it("pickVariant 短记忆跳过最近用过的下标", () => {
    resetNarrativePickMemory();
    const pool = ["a", "b", "c", "d", "e"];
    const picked: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      picked.push(pickVariant("test-pool", pool, 0));
    }
    expect(picked[0]).toBe("a");
    expect(new Set(picked).size).toBe(5);
  });
});
