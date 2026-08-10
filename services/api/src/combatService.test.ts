import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PARAMS } from "@yjh/game-core";
import type { ContentPack } from "@yjh/content";
import type { Db, DbRow } from "./db.js";
import { CombatError, createCombatService } from "./combatService.js";

function makeContent(performDamage = 999): ContentPack {
  return {
    manifest: { version: "0.0.0", name: "test" },
    params: DEFAULT_PARAMS,
    rooms: [
      {
        id: "trail",
        area: "village",
        name: "小径",
        exits: [],
        actions: [],
        npcIds: ["dog"],
        itemIds: [],
      },
    ],
    npcs: [
      {
        id: "dog",
        name: "野狗",
        kind: "battle",
        level: 1,
        attrs: { str: 0, int: 0, con: performDamage > 10 ? -6 : 20, dex: 0 },
        skills: [],
        equipment: [],
        drops: [{ itemId: "dry_food", chance: 1, min: 1, max: 1 }],
        battleRewards: { exp: 5, potential: 2, silver: 3 },
      },
    ],
    items: [{ id: "dry_food", name: "干粮", kind: "food", stackable: true }],
    skills: [
      { id: "basic_sword", name: "基础剑法", kind: "basic", category: "sword", enableSlots: [] },
    ],
    moves: [],
    performs: [
      {
        id: "swift_slash",
        skillId: "basic_sword",
        name: "疾风斩",
        cost: { qi: 0, jing: 0, neili: 0 },
        cooldownTurns: 3,
        conditions: [],
        effect: { type: "damage", amount: performDamage, target: "enemy" },
      },
    ],
    quests: [],
    story: [],
  } as unknown as ContentPack;
}

function mockDb() {
  const character = {
    id: "char_1",
    account_id: "acc_1",
    name: "沈青锋",
    attrs: { str: 15, int: 12, con: 14, dex: 13 },
    exp: 10,
    qi: 100,
    jing: 100,
    neili: 100,
    eff_qi: 100,
    eff_jing: 100,
    room_path: "trail",
    potential: 0,
    silver: 0,
  };
  let session: Record<string, unknown> | undefined;
  const events: Array<{ seq: number; type: string; payload: unknown }> = [];
  const drops: Array<{ itemId: string; count: number }> = [];
  const db: Db = {
    async query<T extends DbRow>(text: string, params: unknown[] = []) {
      if (
        text.includes("SELECT id, name, attrs, exp, qi, jing, neili, eff_qi, eff_jing, room_path")
      ) {
        return { rows: params[0] === "acc_1" ? ([character] as unknown as T[]) : [] };
      }
      if (text.includes("FROM character_skills")) {
        return { rows: [{ skill_id: "basic_sword", level: 1 }] as unknown as T[] };
      }
      if (text.includes("SELECT perform_id FROM character_performs")) {
        return { rows: [{ perform_id: "swift_slash" }] as unknown as T[] };
      }
      if (text.includes("SELECT id FROM combat_sessions")) {
        return {
          rows: session?.status === "ongoing" ? ([{ id: session.id }] as unknown as T[]) : [],
        };
      }
      if (text.includes("INSERT INTO combat_sessions")) {
        session = {
          id: "combat_1",
          target_def_id: params[1],
          status: "ongoing",
          seed: params[2],
          state: params[3],
        };
        return { rows: [session] as T[] };
      }
      if (text.includes("SELECT id, target_def_id, status, seed, state FROM combat_sessions")) {
        return { rows: session?.status === "ongoing" ? ([session] as T[]) : [] };
      }
      if (text.includes("INSERT INTO combat_events")) {
        const isStart = params.length === 2;
        events.push({
          seq: isStart ? 0 : Number(params[1]),
          type: isStart ? "battle_start" : String(params[2]),
          payload: isStart ? params[1] : params[3],
        });
        return { rows: [] as T[] };
      }
      if (text.includes("SELECT seq, type, payload FROM combat_events")) {
        return { rows: events as unknown as T[] };
      }
      if (
        text.includes(
          "UPDATE characters SET qi = $1, jing = $2, neili = $3, eff_qi = $4, eff_jing = $5, exp = exp +",
        )
      ) {
        character.qi = Number(params[0]);
        character.jing = Number(params[1]);
        character.neili = Number(params[2]);
        character.eff_qi = Number(params[3]);
        character.eff_jing = Number(params[4]);
        character.exp += Number(params[5]);
        character.potential += Number(params[6]);
        character.silver += Number(params[7]);
        return { rows: [] as T[] };
      }
      if (
        text.includes(
          "UPDATE characters SET qi = $1, jing = $2, neili = $3, eff_qi = $4, eff_jing = $5",
        )
      ) {
        character.qi = Number(params[0]);
        character.jing = Number(params[1]);
        character.neili = Number(params[2]);
        character.eff_qi = Number(params[3]);
        character.eff_jing = Number(params[4]);
        return { rows: [] as T[] };
      }
      if (text.includes("UPDATE characters SET qi = $1, jing = $2, neili = $3, exp = exp +")) {
        character.qi = Number(params[0]);
        character.jing = Number(params[1]);
        character.neili = Number(params[2]);
        character.exp += Number(params[3]);
        character.potential += Number(params[4]);
        character.silver += Number(params[5]);
        return { rows: [] as T[] };
      }
      if (text.includes("UPDATE characters SET qi = $1, jing = $2, neili = $3")) {
        character.qi = Number(params[0]);
        character.jing = Number(params[1]);
        character.neili = Number(params[2]);
        return { rows: [] as T[] };
      }
      if (text.includes("INSERT INTO character_items")) {
        drops.push({ itemId: String(params[1]), count: Number(params[2]) });
        return { rows: [] as T[] };
      }
      if (text.includes("UPDATE combat_sessions SET state")) {
        session = { ...session, state: params[0], status: params[1] };
        return { rows: [] as T[] };
      }
      return { rows: [] as T[] };
    },
  };
  return { db, events, character, drops };
}

describe("combatService", () => {
  it("绝招决胜：持久化事件、战利与任务击杀推进", async () => {
    const { db, events, character, drops } = mockDb();
    const recordProgress = vi.fn().mockResolvedValue({
      questId: "q_hunt",
      questName: "除野狗",
      phase: 1,
      completed: true,
    });
    const service = createCombatService(db, makeContent(), { recordProgress });
    const started = await service.start("acc_1", ["dog"]);
    expect(started.events[0]).toMatchObject({ seq: 0, type: "battle_start" });
    expect(started.performs).toEqual([
      expect.objectContaining({ id: "swift_slash", name: "疾风斩", ready: true }),
    ]);

    const after = await service.action("acc_1", { action: "perform", performId: "swift_slash" });
    expect(after.status).toBe("finished");
    expect(after.state.winner).toBe("a");
    expect(after.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "perform",
          actor: "a",
          data: expect.objectContaining({ performId: "swift_slash" }),
        }),
        expect.objectContaining({
          type: "reward",
          data: expect.objectContaining({ exp: 5, potential: 2, silver: 3 }),
        }),
        expect.objectContaining({
          type: "quest_progress",
          data: expect.objectContaining({ questId: "q_hunt" }),
        }),
      ]),
    );
    expect(events.map((event) => event.seq)).toEqual(
      [...events.map((event) => event.seq)].sort((a, b) => a - b),
    );
    expect(character).toMatchObject({ exp: 15, potential: 2, silver: 3 });
    expect(drops).toEqual([{ itemId: "dry_food", count: 1 }]);
    expect(recordProgress).toHaveBeenCalledWith("acc_1", "kill", "dog");
  });

  it("绝招由服务端校验：无目标绝招与未收录绝招均被拒绝", async () => {
    const { db } = mockDb();
    const service = createCombatService(db, makeContent());
    await service.start("acc_1", ["dog"]);
    await expect(service.action("acc_1", { action: "perform" })).rejects.toMatchObject({
      code: "perform_required",
    });
    await expect(
      service.action("acc_1", { action: "perform", performId: "ghost_style" }),
    ).rejects.toMatchObject({ code: "perform_not_found" });
  });

  it("绝招冷却随会话状态持久化，不能连回合重复施展", async () => {
    const { db } = mockDb();
    const service = createCombatService(db, makeContent(1));
    await service.start("acc_1", ["dog"]);
    const first = await service.action("acc_1", { action: "perform", performId: "swift_slash" });
    expect(first.status).toBe("ongoing");
    await expect(
      service.action("acc_1", { action: "perform", performId: "swift_slash" }),
    ).rejects.toMatchObject({ code: "perform_cooling_down" });
  });

  it("非同场战斗目标与无进行中战斗被拒绝", async () => {
    const { db } = mockDb();
    const service = createCombatService(db, makeContent());
    await expect(service.start("acc_1", ["ghost"])).rejects.toMatchObject({
      code: "target_not_here",
    });
    await expect(service.action("acc_1", { action: "attack" })).rejects.toBeInstanceOf(CombatError);
  });

  it("同场多敌：开战并入盟友，清场累加收益", async () => {
    const content = makeContent(999);
    content.rooms[0]!.npcIds = ["dog", "pup"];
    content.npcs = [
      {
        ...content.npcs[0]!,
        battleAllies: ["pup"],
      },
      {
        id: "pup",
        name: "幼犬",
        kind: "battle",
        level: 1,
        attrs: { str: 0, int: 0, con: -6, dex: 0 },
        skills: [],
        equipment: [],
        drops: [],
        battleRewards: { exp: 2, potential: 1, silver: 1 },
        battleAllies: [],
      },
    ] as ContentPack["npcs"];
    const { db, character } = mockDb();
    const recordProgress = vi.fn().mockResolvedValue(null);
    const service = createCombatService(db, content, { recordProgress });
    const started = await service.start("acc_1", ["dog"]);
    expect(started.targetIds).toEqual(["dog", "pup"]);
    expect(started.state.foeIds).toEqual(["b0", "b1"]);
    const after = await service.action("acc_1", { action: "perform", performId: "swift_slash" });
    // 一招 999 可能只清一只；继续打到结束
    let current = after;
    for (let i = 0; i < 6 && current.status === "ongoing"; i += 1) {
      current = await service
        .action("acc_1", { action: "perform", performId: "swift_slash" })
        .catch(async () => service.action("acc_1", { action: "attack" }));
    }
    expect(current.status).toBe("finished");
    expect(current.state.winner).toBe("a");
    expect(character.exp).toBeGreaterThan(10);
    expect(recordProgress).toHaveBeenCalledWith("acc_1", "kill", "dog");
    expect(recordProgress).toHaveBeenCalledWith("acc_1", "kill", "pup");
  });
});
