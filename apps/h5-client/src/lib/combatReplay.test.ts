import { describe, expect, it } from "vitest";
import { hudDeltaFromEvent, replayCombatHud } from "./combatReplay.js";
import type { CombatState } from "./combatTypes.js";

describe("hudDeltaFromEvent", () => {
  it("damage/parry 扣目标气；加力扣攻方内", () => {
    expect(
      hudDeltaFromEvent({ type: "damage", actor: "a", data: { targetId: "b0", damage: 12 } }),
    ).toEqual({
      qiById: { b0: -12 },
    });
    expect(
      hudDeltaFromEvent({
        type: "parry",
        actor: "a",
        data: { targetId: "b0", damage: 4, jiali: 2 },
      }),
    ).toEqual({
      qiById: { b0: -4 },
      neiliById: { a: -10 },
    });
  });

  it("recover / heal / poison 增量正确", () => {
    expect(hudDeltaFromEvent({ type: "recover", actor: "a", data: { gained: 12 } })).toEqual({
      neiliById: { a: 12 },
    });
    expect(
      hudDeltaFromEvent({ type: "perform", actor: "a", data: { heal: 8, performId: "x" } }),
    ).toEqual({ qiById: { a: 8 } });
    expect(hudDeltaFromEvent({ type: "poison_tick", actor: "b0", data: { damage: 3 } })).toEqual({
      qiById: { b0: -3 },
    });
  });
});

describe("replayCombatHud", () => {
  const base: CombatState = {
    enemyName: "野狗",
    enemyQi: 30,
    enemyMaxQi: 50,
    enemies: [{ id: "b0", name: "野狗", qi: 30, maxQi: 50, down: false }],
    playerQi: 70,
    playerMaxQi: 100,
    playerJing: 50,
    playerMaxJing: 80,
    playerNeili: 20,
    playerMaxNeili: 50,
    jiali: 0,
    busyTurns: 0,
    log: [
      { id: 0, text: "开战", kind: "start" },
      {
        id: 1,
        text: "你命中",
        kind: "damage",
        actorId: "a",
        hud: { qiById: { b0: -20 } },
      },
      { id: 2, text: "", kind: "exchange" },
      {
        id: 3,
        text: "野狗还手",
        kind: "hurt",
        actorId: "b0",
        hud: { qiById: { a: -10 } },
      },
    ],
    performs: [],
    inCombat: true,
  };

  it("visibleCount=终态时与服务端气血一致", () => {
    const hud = replayCombatHud(base, 4);
    expect(hud.playerQi).toBe(70);
    expect(hud.enemies[0]?.qi).toBe(30);
    expect(hud.activeActorId).toBe("b0");
  });

  it("只显现到玩家命中时：敌气已掉、己气未掉", () => {
    const hud = replayCombatHud(base, 2);
    expect(hud.playerQi).toBe(80);
    expect(hud.enemies[0]?.qi).toBe(30);
    expect(hud.activeActorId).toBe("a");
  });

  it("开战行：双方气血尚未因本回合交手变化", () => {
    const hud = replayCombatHud(base, 1);
    expect(hud.playerQi).toBe(80);
    expect(hud.enemies[0]?.qi).toBe(50);
    expect(hud.activeActorId).toBeUndefined();
  });
});
