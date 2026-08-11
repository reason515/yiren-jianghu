/**
 * 战斗 HUD 回放：血条随已显现战报行推进，避免终态气血抢跑（DC-050）。
 */

import type { CombatEnemyView, CombatHudDelta, CombatLine, CombatState } from "./combatTypes.js";

export interface CombatHudSnapshot {
  playerQi: number;
  playerNeili: number;
  enemies: CombatEnemyView[];
  /** 当前行动方（用于轻量高亮）；spacer/exchange 不计入 */
  activeActorId?: string;
}

function asRecord(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

/** 从服务端事件提取 HUD 增量（正=回血/回内，负=扣减）。 */
export function hudDeltaFromEvent(event: {
  type: string;
  actor?: string;
  data: unknown;
}): CombatHudDelta | undefined {
  const data = asRecord(event.data);
  const actor = event.actor ?? "a";
  const targetId = typeof data.targetId === "string" ? data.targetId : undefined;
  const qiById: Record<string, number> = {};
  const neiliById: Record<string, number> = {};

  switch (event.type) {
    case "damage":
    case "parry": {
      const damage = typeof data.damage === "number" ? data.damage : 0;
      if (targetId && damage > 0) qiById[targetId] = -damage;
      const jiali = typeof data.jiali === "number" ? data.jiali : 0;
      if (jiali > 0 && actor === "a") {
        // 与内容包默认 jialiNeiliPerLevel=5 对齐；仅影响 HUD 回放
        neiliById[actor] = -(jiali * 5);
      }
      break;
    }
    case "poison_tick": {
      const damage = typeof data.damage === "number" ? data.damage : 0;
      if (damage > 0) qiById[actor] = -damage;
      break;
    }
    case "perform": {
      if (typeof data.damage === "number" && data.damage > 0 && targetId) {
        qiById[targetId] = -data.damage;
      }
      if (typeof data.heal === "number" && data.heal > 0) {
        qiById[actor] = (qiById[actor] ?? 0) + data.heal;
      }
      if (typeof data.cure === "number" && data.cure > 0) {
        // applyCureQi：抬 eff 后回 floor(raised/2) 气
        qiById[actor] = (qiById[actor] ?? 0) + Math.floor(data.cure / 2);
      }
      break;
    }
    case "recover": {
      const gained = typeof data.gained === "number" ? data.gained : 0;
      if (gained > 0) neiliById[actor] = gained;
      break;
    }
    default:
      return undefined;
  }

  if (Object.keys(qiById).length === 0 && Object.keys(neiliById).length === 0) {
    return undefined;
  }
  return {
    ...(Object.keys(qiById).length > 0 ? { qiById } : {}),
    ...(Object.keys(neiliById).length > 0 ? { neiliById } : {}),
  };
}

function reverseDelta(
  playerQi: number,
  playerNeili: number,
  enemyQi: Record<string, number>,
  delta: CombatHudDelta | undefined,
): { playerQi: number; playerNeili: number } {
  if (!delta) return { playerQi, playerNeili };
  let nextQi = playerQi;
  let nextNeili = playerNeili;
  if (delta.qiById) {
    for (const [id, change] of Object.entries(delta.qiById)) {
      if (id === "a") nextQi -= change;
      else if (enemyQi[id] !== undefined) enemyQi[id] = (enemyQi[id] ?? 0) - change;
    }
  }
  if (delta.neiliById) {
    for (const [id, change] of Object.entries(delta.neiliById)) {
      if (id === "a") nextNeili -= change;
    }
  }
  return { playerQi: nextQi, playerNeili: nextNeili };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** 是否计入「当前行动方」高亮。 */
export function isActionCombatLine(line: CombatLine): boolean {
  if (!line.actorId) return false;
  if (line.kind === "spacer" || line.kind === "exchange") return false;
  return true;
}

/**
 * 从服务端终态气血，按尚未显现的战报行反向回放，得到当前应显示的 HUD。
 */
export function replayCombatHud(state: CombatState, visibleCount: number): CombatHudSnapshot {
  const enemies = (
    state.enemies.length > 0
      ? state.enemies
      : [
          {
            id: "b0",
            name: state.enemyName,
            qi: state.enemyQi,
            maxQi: state.enemyMaxQi,
            down: state.enemyQi <= 0,
          },
        ]
  ).map((e) => ({ ...e }));

  const enemyQi: Record<string, number> = {};
  for (const e of enemies) enemyQi[e.id] = e.qi;

  let playerQi = state.playerQi;
  let playerNeili = state.playerNeili;
  const capped = Math.max(0, Math.min(visibleCount, state.log.length));

  for (let i = state.log.length - 1; i >= capped; i -= 1) {
    const line = state.log[i];
    if (!line) continue;
    const reversed = reverseDelta(playerQi, playerNeili, enemyQi, line.hud);
    playerQi = reversed.playerQi;
    playerNeili = reversed.playerNeili;
  }

  playerQi = clamp(playerQi, 0, state.playerMaxQi);
  playerNeili = clamp(playerNeili, 0, state.playerMaxNeili);

  const displayedEnemies = enemies.map((e) => {
    const qi = clamp(enemyQi[e.id] ?? e.qi, 0, e.maxQi);
    return { ...e, qi, down: qi <= 0 };
  });

  let activeActorId: string | undefined;
  for (let i = capped - 1; i >= 0; i -= 1) {
    const line = state.log[i];
    if (line && isActionCombatLine(line)) {
      activeActorId = line.actorId;
      break;
    }
  }

  return {
    playerQi,
    playerNeili,
    enemies: displayedEnemies,
    ...(activeActorId ? { activeActorId } : {}),
  };
}
