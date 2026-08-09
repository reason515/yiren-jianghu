import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS } from "@yjh/game-core";
import type { Db, DbRow } from "./db.js";
import { settleCharacterVitals } from "./vitalsSettle.js";

describe("settleCharacterVitals（DC-044）", () => {
  it("last_heal_at 为空时只初始化时钟，不改资源", async () => {
    const character = {
      id: "c1",
      account_id: "a1",
      status: "active",
      qi: 10,
      jing: 20,
      jingli: 30,
      neili: 0,
      food: 300,
      water: 300,
      attrs: { str: 20, int: 20, con: 20, dex: 20 },
      last_heal_at: null as string | null,
    };
    const db: Db = {
      async query<T extends DbRow>(text: string, params: unknown[] = []) {
        if (text.includes("SELECT id, qi, jing")) {
          return { rows: [character] as unknown as T[] };
        }
        if (text.includes("UPDATE characters SET last_heal_at = now()")) {
          character.last_heal_at = new Date().toISOString();
          expect(params[0]).toBe("c1");
          return { rows: [] as unknown as T[] };
        }
        throw new Error(`unexpected: ${text}`);
      },
    };
    const next = await settleCharacterVitals(
      db,
      { params: DEFAULT_PARAMS, getSkillCategory: () => undefined },
      "a1",
    );
    expect(next).toMatchObject({ qi: 10, jing: 20, food: 300 });
    expect(character.last_heal_at).toBeTruthy();
  });

  it("满 10 分钟结算：气精回升、食水下降", async () => {
    const character = {
      id: "c1",
      account_id: "a1",
      status: "active",
      qi: 0,
      jing: 0,
      jingli: 0,
      neili: 0,
      food: 300,
      water: 300,
      attrs: { str: 20, int: 20, con: 20, dex: 20 },
      last_heal_at: new Date(Date.now() - 10 * 60000).toISOString(),
    };
    const db: Db = {
      async query<T extends DbRow>(text: string, params: unknown[] = []) {
        if (text.includes("SELECT id, qi, jing")) {
          return { rows: [character] as unknown as T[] };
        }
        if (text.includes("SELECT skill_id, level")) {
          return { rows: [] as unknown as T[] };
        }
        if (text.includes("UPDATE characters SET qi = $1")) {
          character.qi = Number(params[0]);
          character.jing = Number(params[1]);
          character.jingli = Number(params[2]);
          character.neili = Number(params[3]);
          character.food = Number(params[4]);
          character.water = Number(params[5]);
          return { rows: [] as unknown as T[] };
        }
        throw new Error(`unexpected: ${text}`);
      },
    };
    const next = await settleCharacterVitals(
      db,
      { params: DEFAULT_PARAMS, getSkillCategory: () => undefined },
      "a1",
    );
    // maxQi/Jing=210：floor(210*0.03*10)=63 / floor(210*0.025*10)=52；食水按 0.8/1.2 扣
    expect(next).toMatchObject({ qi: 63, jing: 52, food: 292, water: 288 });
  });
});
