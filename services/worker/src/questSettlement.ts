import {
  buildCombatant,
  createSeededRng,
  createTacticSelector,
  rollDrops,
  runBattle,
  tacticTemplateSchema,
  type Combatant,
  type TacticTemplate,
} from "@yjh/game-core";
import type { ContentPack, Npc } from "@yjh/content";

export interface QuestCombatCharacter {
  id: string;
  name: string;
  attrs: { str: number; int: number; con: number; dex: number };
  qi: number;
  jing: number;
  neili: number;
  exp: number;
}

export interface QuestBattleResult {
  won: boolean;
  reason?: "defeated" | "fled" | "draw" | "invalid_template";
  combatant: Combatant;
  turns: number;
  drops: Array<{ itemId: string; count: number }>;
}

/** 同一作业、同一击杀序号永远使用同一随机源，事务回滚重试不会改变结果。 */
export function seedForQuestJob(
  jobId: string,
  killIndex: number,
  purpose: "battle" | "drops",
): number {
  const input = `${jobId}|${killIndex}|${purpose}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function combatantForNpc(content: ContentPack, npc: Npc): Combatant {
  const categories = new Map(content.skills.map((skill) => [skill.id, skill.category]));
  const attrs = npc.attrs ?? {
    str: 10 + (npc.level ?? 1),
    int: 10,
    con: 10 + (npc.level ?? 1),
    dex: 10 + (npc.level ?? 1),
  };
  return buildCombatant(
    content.params,
    { id: `npc:${npc.id}`, name: npc.name, attrs },
    npc.skills.flatMap((skill) => {
      const category = categories.get(skill.skillId);
      return category ? [{ category, level: skill.level }] : [];
    }),
  );
}

/** 一次行侠战斗：角色资源与战术均来自作业启动时的服务端快照。 */
export function settleQuestBattle(input: {
  content: ContentPack;
  jobId: string;
  killIndex: number;
  character: QuestCombatCharacter;
  skillLevels: Map<string, number>;
  templateSnapshot: unknown;
  target: Npc;
}): QuestBattleResult {
  const template = tacticTemplateSchema.safeParse(input.templateSnapshot);
  if (!template.success) {
    return {
      won: false,
      reason: "invalid_template",
      combatant: buildCombatant(input.content.params, input.character, [], "current"),
      turns: 0,
      drops: [],
    };
  }
  const categories = new Map(input.content.skills.map((skill) => [skill.id, skill.category]));
  const player = buildCombatant(
    input.content.params,
    input.character,
    [...input.skillLevels].flatMap(([skillId, level]) => {
      const category = categories.get(skillId);
      return category ? [{ category, level }] : [];
    }),
    "current",
  );
  const battle = runBattle({
    a: player,
    b: combatantForNpc(input.content, input.target),
    selectors: {
      a: createTacticSelector(template.data as TacticTemplate, {
        performs: new Map(input.content.performs.map((perform) => [perform.id, perform])),
        skillLevels: input.skillLevels,
      }),
      b: () => ({ type: "attack" }),
    },
    seed: seedForQuestJob(input.jobId, input.killIndex, "battle"),
    params: input.content.params,
  });
  const won = battle.winner === "a";
  return {
    won,
    ...(won
      ? {}
      : { reason: battle.fled === "a" ? "fled" : battle.winner === "b" ? "defeated" : "draw" }),
    combatant: battle.combatants.a,
    turns: battle.turns,
    drops: won
      ? rollDrops(
          createSeededRng(seedForQuestJob(input.jobId, input.killIndex, "drops")),
          input.target.drops,
          input.character.exp,
        )
      : [],
  };
}
