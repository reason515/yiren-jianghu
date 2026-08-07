import { buildCombatant, type Combatant } from "@yjh/game-core";
import type { ContentPack, Npc } from "@yjh/content";

export interface CharacterCombatSource {
  id: string;
  name: string;
  attrs: { str: number; int: number; con: number; dex: number };
  qi?: number;
  jing?: number;
  neili?: number;
}

/**
 * F0/F1 共用的角色战斗体构造：战斗属性公式只在此处保留一份。
 * PVP 以满状态取快照；PVE 传入当前资源，结算仍始终在服务端进行。
 */
export function buildCharacterCombatant(
  content: ContentPack,
  character: CharacterCombatSource,
  skillLevels: Map<string, number>,
  resourceMode: "full" | "current" = "full",
): Combatant {
  const skillDefs = new Map(content.skills.map((skill) => [skill.id, skill]));
  return buildCombatant(
    content.params,
    character,
    [...skillLevels].flatMap(([skillId, level]) => {
      const definition = skillDefs.get(skillId);
      return definition ? [{ category: definition.category, level }] : [];
    }),
    resourceMode,
  );
}

/** NPC 由内容包定义；未填 attributes 的低阶敌人采用等级基线，以保证旧内容可进入战斗。 */
export function buildNpcCombatant(content: ContentPack, npc: Npc): Combatant {
  const level = npc.level ?? 1;
  const attrs = npc.attrs ?? { str: 10 + level, int: 10, con: 10 + level, dex: 10 + level };
  return buildCharacterCombatant(
    content,
    { id: `npc:${npc.id}`, name: npc.name, attrs },
    new Map(npc.skills.map((skill) => [skill.skillId, skill.level])),
  );
}
