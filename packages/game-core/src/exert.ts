import type { Perform } from "@yjh/content";
import { applyCureQi, applyHealQi } from "./combat.js";
import { DEFAULT_MECHANICS, DEFAULT_PARAMS, type GameParams } from "./params.js";
import { scalePerformAmount } from "./perform.js";
import type { CompiledMechanics } from "@yjh/content";

/** 场外运功用的生存快照（DC-052）。 */
export interface ExertVitals {
  qi: number;
  maxQi: number;
  effQi: number;
  jing: number;
  maxJing: number;
  effJing: number;
  neili: number;
  maxNeili: number;
}

export type FieldExertKind = "heal" | "cure" | "heal_jing";

export type ExertFailReason = "not_field" | "not_learned" | "cost" | "condition" | "no_effect";

export interface ExertOk {
  ok: true;
  kind: FieldExertKind;
  amount: number;
  vitals: ExertVitals;
  cost: { qi: number; jing: number; neili: number };
}

export interface ExertFail {
  ok: false;
  reason: ExertFailReason;
  detail?: string;
}

export type ExertResult = ExertOk | ExertFail;

/** 是否可作为场外运功（自疗/回气/回精；拒伤害与护体 buff）。 */
export function isFieldExertPerform(p: Perform): boolean {
  if (p.effect.target !== "self") return false;
  if (p.effect.type === "heal_jing") return true;
  if (p.effect.type === "heal") return true;
  return false;
}

export function fieldExertKind(p: Perform): FieldExertKind | null {
  if (!isFieldExertPerform(p)) return null;
  if (p.effect.type === "heal_jing") return "heal_jing";
  if (p.id.startsWith("cure_") || p.name.includes("疗伤")) return "cure";
  return "heal";
}

function evalFieldConditions(p: Perform, vitals: ExertVitals, skillLevel: number): string | null {
  for (const cond of p.conditions) {
    switch (cond.type) {
      case "self_qi_below_pct": {
        const pct = (vitals.qi / Math.max(1, vitals.maxQi)) * 100;
        if (!(pct < cond.value)) return `self_qi_below_pct 未满足（当前 ${pct.toFixed(1)}%）`;
        break;
      }
      case "self_neili_above_pct": {
        const pct = (vitals.neili / Math.max(1, vitals.maxNeili)) * 100;
        if (!(pct >= cond.value)) return `self_neili_above_pct 未满足（当前 ${pct.toFixed(1)}%）`;
        break;
      }
      case "skill_level_at_least": {
        if (skillLevel < cond.value) return `skill_level_at_least 未满足（技能等级 ${skillLevel}）`;
        break;
      }
      case "enemy_qi_below_pct":
        return "场外不可用敌方条件";
    }
  }
  return null;
}

function applyHealJing(vitals: ExertVitals, amount: number): number {
  const eff = vitals.effJing;
  const room = Math.max(0, eff - vitals.jing);
  const healed = Math.min(amount, room);
  vitals.jing += healed;
  return healed;
}

/**
 * 场外运功：耗内/气/精施展自疗类绝招（DC-052，补 DC-051 另案）。
 * 无战斗冷却；效果量按所属技能原级放大。
 */
export function applyFieldExert(input: {
  perform: Perform;
  learned: boolean;
  skillLevel: number;
  vitals: ExertVitals;
  params?: GameParams;
  mechanics?: CompiledMechanics;
}): ExertResult {
  const { perform, learned, skillLevel } = input;
  const params = input.params ?? DEFAULT_PARAMS;
  const mechanics = input.mechanics ?? DEFAULT_MECHANICS;
  const kind = fieldExertKind(perform);
  if (!kind) return { ok: false, reason: "not_field", detail: "此式不可场外运功" };
  if (!learned) return { ok: false, reason: "not_learned", detail: "此式尚未参悟" };

  const vitals: ExertVitals = { ...input.vitals };
  const cost = {
    qi: perform.cost.qi ?? 0,
    jing: perform.cost.jing ?? 0,
    neili: perform.cost.neili ?? 0,
  };
  if (vitals.qi < cost.qi || vitals.jing < cost.jing || vitals.neili < cost.neili) {
    return { ok: false, reason: "cost", detail: "消耗不足" };
  }
  const cond = evalFieldConditions(perform, vitals, skillLevel);
  if (cond) return { ok: false, reason: "condition", detail: cond };

  vitals.qi -= cost.qi;
  vitals.jing -= cost.jing;
  vitals.neili -= cost.neili;

  const flat = scalePerformAmount(perform.effect.amount, skillLevel, params, mechanics);
  const proxy = {
    id: "self",
    name: "你",
    qi: vitals.qi,
    maxQi: vitals.maxQi,
    effQi: vitals.effQi,
    jing: vitals.jing,
    maxJing: vitals.maxJing,
    neili: vitals.neili,
    maxNeili: vitals.maxNeili,
    stats: {
      attack: 0,
      defense: 0,
      dodge: 0,
      parry: 0,
      forceLevel: 0,
      weaponLevel: 0,
      attackSkillLevel: 0,
      dodgeSkillLevel: 0,
      parrySkillLevel: 0,
      combatExp: 0,
      str: 0,
      dex: 0,
      con: 0,
    },
  };

  let amount = 0;
  if (kind === "cure") {
    amount = applyCureQi(proxy, flat);
    vitals.effQi = proxy.effQi ?? vitals.effQi;
    vitals.qi = proxy.qi;
  } else if (kind === "heal") {
    amount = applyHealQi(proxy, flat);
    vitals.qi = proxy.qi;
  } else {
    amount = applyHealJing(vitals, flat);
  }

  if (amount <= 0) return { ok: false, reason: "no_effect", detail: "气机已满，无需再运" };

  return { ok: true, kind, amount, vitals, cost };
}
