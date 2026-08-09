import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS } from "./params.js";
import { buildCombatant, type BuildCombatantOptions, type CombatantSkillDef } from "./combatant.js";
import { computeMaxVitals } from "./vitals.js";

const SKILL_DEFS = new Map<string, CombatantSkillDef>([
  ["basic_force", { kind: "basic", category: "force", enableSlots: [] }],
  ["basic_sword", { kind: "basic", category: "sword", enableSlots: [] }],
  ["basic_unarmed", { kind: "basic", category: "unarmed", enableSlots: [] }],
  ["basic_dodge", { kind: "basic", category: "dodge", enableSlots: [] }],
  ["basic_parry", { kind: "basic", category: "parry", enableSlots: [] }],
  ["xuanmen_force", { kind: "special", category: "force", enableSlots: ["force"] }],
  ["xuanmen_sword", { kind: "special", category: "sword", enableSlots: ["sword"] }],
  ["xuanmen_knowledge", { kind: "special", category: "knowledge", enableSlots: [] }],
]);

function opts(overrides: Partial<BuildCombatantOptions> = {}): BuildCombatantOptions {
  return {
    skills: [
      { id: "basic_force", level: 40 },
      { id: "basic_sword", level: 20 },
      { id: "basic_unarmed", level: 10 },
      { id: "basic_dodge", level: 10 },
      { id: "basic_parry", level: 10 },
      { id: "xuanmen_force", level: 30 },
      { id: "xuanmen_sword", level: 50 },
    ],
    skillDefs: SKILL_DEFS,
    enableMap: { force: "xuanmen_force", sword: "xuanmen_sword" },
    hasWeapon: true,
    ...overrides,
  };
}

const SOURCE = {
  id: "hero",
  name: "侠客",
  attrs: { str: 15, int: 10, con: 12, dex: 14 },
};

describe("buildCombatant（DC-041：基本功/特殊功激发有效等级）", () => {
  it("有兵器 → 攻击槎为 sword；有效等级 = floor(基本功/2) + 已激发特殊功原级", () => {
    const c = buildCombatant(DEFAULT_PARAMS, SOURCE, opts());
    expect(c.attackSkillSlot).toBe("sword");
    // force: floor(40/2)+30 = 50
    expect(c.effective?.force).toBe(50);
    expect(c.stats.forceLevel).toBe(50);
    // sword: floor(20/2)+50 = 60
    expect(c.effective?.weapon).toBe(60);
    expect(c.stats.weaponLevel).toBe(60);
    expect(c.stats.attackSkillLevel).toBe(60);
    // dodge/parry 无特殊功激发：floor(10/2) = 5
    expect(c.effective?.dodge).toBe(5);
    expect(c.effective?.parry).toBe(5);
    expect(c.stats.dodgeSkillLevel).toBe(5);
    expect(c.stats.parrySkillLevel).toBe(5);
  });

  it("无兵器 → 攻击槎为 unarmed（basic_sword 的激发不影响 unarmed 有效等级）", () => {
    const c = buildCombatant(DEFAULT_PARAMS, SOURCE, opts({ hasWeapon: false }));
    expect(c.attackSkillSlot).toBe("unarmed");
    // unarmed 无特殊功可激（enableMap 只挂了 force/sword）：floor(10/2) = 5
    expect(c.effective?.weapon).toBe(5);
    expect(c.stats.weaponLevel).toBe(5);
    expect(c.stats.attackSkillLevel).toBe(5);
  });

  it("enableMap 缺省槎位 = 纯基本功（无特殊功加成）", () => {
    const c = buildCombatant(DEFAULT_PARAMS, SOURCE, opts({ enableMap: {} }));
    expect(c.stats.forceLevel).toBe(20); // floor(40/2)
    expect(c.stats.weaponLevel).toBe(10); // floor(20/2)，sword 无激发
  });

  it("未在 skillDefs 中登记的技能被忽略（安全兜底）", () => {
    const c = buildCombatant(
      DEFAULT_PARAMS,
      SOURCE,
      opts({ skills: [{ id: "ghost_skill", level: 999 }], enableMap: {} }),
    );
    expect(c.stats.forceLevel).toBe(0);
    expect(c.stats.weaponLevel).toBe(0);
  });

  it("stats 携带原始属性与战斗经验（供 skillPower 使用）", () => {
    const c = buildCombatant(DEFAULT_PARAMS, { ...SOURCE, exp: 12345 }, opts());
    expect(c.stats.str).toBe(15);
    expect(c.stats.dex).toBe(14);
    expect(c.stats.con).toBe(12);
    expect(c.stats.combatExp).toBe(12345);
    expect(c.exp).toBe(12345);
  });

  it("未传 exp 时 combatExp 默认 0", () => {
    const c = buildCombatant(DEFAULT_PARAMS, SOURCE, opts());
    expect(c.stats.combatExp).toBe(0);
    expect(c.exp).toBe(0);
  });

  it("动态上限沿用 vitals 公式（forceLevel 取有效内功等级）", () => {
    const c = buildCombatant(DEFAULT_PARAMS, SOURCE, opts());
    const expected = computeMaxVitals(DEFAULT_PARAMS, { ...SOURCE.attrs, forceLevel: 50 });
    expect(c.maxQi).toBe(expected.maxQi);
    expect(c.maxJing).toBe(expected.maxJing);
    expect(c.maxNeili).toBe(expected.maxNeili);
  });

  it("resourceMode=full（默认）：资源满值；current：读取当前值并下限 0", () => {
    const full = buildCombatant(DEFAULT_PARAMS, SOURCE, opts());
    expect(full.qi).toBe(full.maxQi);

    const current = buildCombatant(
      DEFAULT_PARAMS,
      { ...SOURCE, qi: 3, jing: 2, neili: 1 },
      opts({ resourceMode: "current" }),
    );
    expect(current.qi).toBe(3);
    expect(current.jing).toBe(2);
    expect(current.neili).toBe(1);
  });

  it("兼容展示字段：attack = str + 有效攻击槎等级；defense/dodge/parry 含属性基线", () => {
    const c = buildCombatant(DEFAULT_PARAMS, SOURCE, opts());
    expect(c.stats.attack).toBe(SOURCE.attrs.str + 60);
    expect(c.stats.defense).toBe(DEFAULT_PARAMS.combat.defenseBase + SOURCE.attrs.con);
    expect(c.stats.dodge).toBe(DEFAULT_PARAMS.combat.dodgeBase + SOURCE.attrs.dex + 5);
    expect(c.stats.parry).toBe(DEFAULT_PARAMS.combat.parryBase + 5);
  });
});
