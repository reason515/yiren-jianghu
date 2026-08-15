// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { CharacterSheet } from "./CharacterSheet.js";
import type { CharacterView } from "../lib/characterTypes.js";

function render(ui: ReactElement): { host: HTMLDivElement; root: Root } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(ui));
  return { host, root };
}

afterEach(() => {
  document.body.innerHTML = "";
});

const CHARACTER: CharacterView = {
  id: "char_1",
  name: "陆小风",
  gender: "male",
  exp: 1200,
  effectivePotential: 88,
  silver: 25,
  vitals: { qi: 92, jing: 84, jingli: 70, neili: 20 },
  vitalsMax: { qi: 420, jing: 380, jingli: 300, neili: 200 },
  attrs: {
    str: { cur: 25, base: 20 },
    int: { cur: 20, base: 20 },
    con: { cur: 20, base: 20 },
    dex: { cur: 15, base: 20 },
  },
  skillEnable: { force: "xuanmen_force" },
  effective: { force: 18, sword: 4, unarmed: 2, dodge: 0, parry: 0, blade: 0 },
  combat: { attack: 34, defense: 28 },
  moves: [{ id: "sword_pierce", name: "白虹贯日", skillId: "xuanmen_sword" }],
  performs: [
    {
      id: "force_heal",
      name: "回春诀",
      skillId: "xuanmen_force",
      fieldKind: "heal",
      cost: { qi: 0, jing: 0, neili: 20 },
    },
  ],
  skills: [
    {
      id: "basic_unarmed",
      name: "基本拳脚",
      category: "unarmed",
      kind: "basic",
      enableSlots: [],
      level: 4,
      maxLevel: 200,
      practicePoints: 1,
    },
    {
      id: "xuanmen_force",
      name: "玄门内功",
      category: "force",
      kind: "special",
      enableSlots: ["force"],
      description: "吐纳凝神，以内息护体。",
      level: 12,
      maxLevel: 300,
      practicePoints: 4,
    },
    {
      id: "xuanmen_sword",
      name: "玄门剑法",
      category: "sword",
      kind: "special",
      enableSlots: ["sword"],
      level: 9,
      maxLevel: 300,
      practicePoints: 2,
    },
    {
      id: "unlearned",
      name: "未学之术",
      category: "knowledge",
      kind: "basic",
      enableSlots: [],
      level: 0,
      maxLevel: 100,
      practicePoints: 0,
    },
  ],
  equipment: [
    { slot: "weapon", item: { id: "iron_sword", name: "铁剑" } },
    { slot: "armor", item: { id: "cloth_1", name: "粗布衣" } },
  ],
  inventory: [
    { id: "cloth_1", name: "粗布衣", kind: "armor", quantity: 1, equipped: true },
    {
      id: "cloth_armor",
      name: "旧皮甲",
      kind: "armor",
      quantity: 1,
      equipped: false,
      description: "旧皮缝制，尚能抵挡寻常拳脚。",
      stats: { defense: 3 },
    },
    { id: "dry_food", name: "干粮", kind: "food", quantity: 3, equipped: false },
    { id: "jinchuang_yao", name: "金创药", kind: "drug", quantity: 1, equipped: false },
  ],
};

function clickTab(host: HTMLDivElement, label: string): void {
  const btn = [...host.querySelectorAll<HTMLButtonElement>(".char-tabs [role='tab']")].find(
    (candidate) => candidate.textContent === label,
  )!;
  act(() => btn.click());
}

function clickSkillsSubTab(host: HTMLDivElement, label: string): void {
  const btn = [...host.querySelectorAll<HTMLButtonElement>(".char-skills-tabs [role='tab']")].find(
    (candidate) => candidate.textContent === label,
  )!;
  act(() => btn.click());
}

describe("CharacterSheet（角色面板）", () => {
  it("摘要带语义标签，默认状态页签，页签面板固定高度", () => {
    const { host } = render(
      <CharacterSheet open character={CHARACTER} onClose={() => undefined} />,
    );
    expect(host.textContent).toContain("历练");
    expect(host.textContent).toContain("1200");
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("状态");
    expect(host.querySelector('[data-testid="char-tab-panel"]')).not.toBeNull();
    expect(host.querySelector(".char-tabs")).not.toBeNull();
    expect(host.querySelector(".seg")).toBeNull();
  });

  it("状态页：资源直接展示当前/上限，四维以表格展示当前与先天", () => {
    const { host } = render(
      <CharacterSheet open character={CHARACTER} onClose={() => undefined} />,
    );
    expect(host.textContent).toContain("气血");
    expect(host.querySelector(".char-vital-cur")?.textContent).toBe("92");
    expect(host.querySelector(".char-vital-max")?.textContent).toBe("420");
    expect(host.textContent).not.toContain("行止");
    expect(host.textContent).not.toContain("四维");
    expect(host.querySelector(".char-attr-table")).not.toBeNull();
    expect(host.querySelector("[data-attr=str]")?.textContent).toContain("膂力2520");
  });

  it("状态页：展示由当前武学与佩挂计算的攻防", () => {
    const { host } = render(
      <CharacterSheet open character={CHARACTER} onClose={() => undefined} />,
    );
    expect(host.querySelector("[data-testid=char-combat-stats]")?.textContent).toContain("攻击34");
    expect(host.querySelector("[data-testid=char-combat-stats]")?.textContent).toContain("防御28");
    expect(host.querySelector("[data-testid=char-combat-stats]")?.textContent).toContain(
      "攻击＝当前膂力＋当前所用武学等级（兵器或拳脚）＋装备攻击；防御＝基础 8＋当前根骨＋衣甲防御。",
    );
  });

  it("状态页：已学场外运功才在行止下显示对应按钮", () => {
    const ids: string[] = [];
    const { host } = render(
      <CharacterSheet
        open
        character={CHARACTER}
        onClose={() => undefined}
        onExertPerform={(id) => ids.push(id)}
      />,
    );
    expect(host.querySelector("[data-testid=char-exert]")).not.toBeNull();
    expect(host.textContent).toContain("回春诀");
    expect(host.textContent).toContain("回气");
    expect(host.textContent).toContain("内力 20");
    act(() =>
      host.querySelector<HTMLButtonElement>("[data-testid=char-exert-force_heal] .chip")!.click(),
    );
    expect(ids).toEqual(["force_heal"]);
  });

  it("状态页：未学自疗绝招时不占位", () => {
    const empty: CharacterView = { ...CHARACTER, performs: [] };
    const { host } = render(
      <CharacterSheet
        open
        character={empty}
        onClose={() => undefined}
        onExertPerform={() => undefined}
      />,
    );
    expect(host.querySelector("[data-testid=char-exert]")).toBeNull();
    expect(host.textContent).not.toContain("回春诀");
  });

  it("武学页：临敌有效等级 + 折叠不见演练点/招式清单", () => {
    const { host } = render(
      <CharacterSheet open character={CHARACTER} onClose={() => undefined} />,
    );
    clickTab(host, "武学");
    expect(host.querySelector(".char-skills-tabs")).not.toBeNull();
    expect(host.querySelector(".char-tabs .char-skills-tabs")).toBeNull();
    expect(host.querySelector("[data-testid=char-combat]")).not.toBeNull();
    expect(host.querySelector("[data-testid=combat-force]")?.textContent).toContain("内功");
    expect(host.querySelector("[data-testid=combat-force]")?.textContent).toContain("玄门内功");
    expect(host.querySelector("[data-testid=combat-force]")?.textContent).toContain("18");
    expect(host.querySelector("[data-testid=combat-unarmed]")?.textContent).toContain("未激发");
    expect(host.querySelector("[data-testid=combat-unarmed]")?.textContent).toContain("2");
    expect(host.querySelector("[data-testid=skill-row-xuanmen_force]")).toBeNull();
    expect(host.textContent).not.toContain("演练点");
    expect(host.textContent).not.toContain("白虹贯日");
    expect(host.textContent).not.toContain("Lv");
    expect(host.textContent).not.toMatch(/\bforce\b/);
    expect(host.textContent).not.toMatch(/\bsword\b/);
    expect(host.querySelector(".seg")).toBeNull();
    expect(host.querySelector(".char-skill-bar")).toBeNull();
  });

  it("武学页：特殊功展开后可演练、激发；□ 与境界标签", () => {
    const skills: string[] = [];
    const enables: string[] = [];
    const { host } = render(
      <CharacterSheet
        open
        character={CHARACTER}
        onClose={() => undefined}
        onSkillAction={(action, id) => skills.push(`${action}:${id}`)}
        onEnableSkill={(slot, id) => enables.push(`${slot}:${id ?? "none"}`)}
      />,
    );
    clickTab(host, "武学");
    clickSkillsSubTab(host, "特殊功");

    const forceRow = host.querySelector('[data-testid="skill-row-xuanmen_force"]')!;
    expect(forceRow.textContent).toContain("□");
    expect(forceRow.textContent).toContain("不堪一击");
    expect(forceRow.textContent).not.toContain("用");

    const toggle = host.querySelector<HTMLButtonElement>(
      '[data-testid="skill-row-xuanmen_force"] .char-skill-toggle',
    )!;
    act(() => toggle.click());
    expect(host.textContent).toContain("演练点 4");
    expect(host.textContent).toContain("回春诀");
    expect(host.textContent).toContain("卸下");
    expect(host.textContent).toContain("演练");
    expect(host.textContent).not.toContain("激发为内功");
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>(".chip")]
        .find((c) => c.textContent === "演练")!
        .click(),
    );
    expect(skills).toEqual(["practice:xuanmen_force"]);
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>(".chip")]
        .find((c) => c.textContent === "卸下")!
        .click(),
    );
    expect(enables).toEqual(["force:none"]);

    act(() =>
      host
        .querySelector<HTMLButtonElement>(
          '[data-testid="skill-row-xuanmen_sword"] .char-skill-toggle',
        )!
        .click(),
    );
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>(".chip")]
        .find((c) => c.textContent === "激发为剑法")!
        .click(),
    );
    expect(enables).toEqual(["force:none", "sword:xuanmen_sword"]);
  });

  it("武学页：全未学时临敌给出空态说明", () => {
    const empty: CharacterView = {
      ...CHARACTER,
      skills: CHARACTER.skills.map((skill) => ({ ...skill, level: 0 })),
      skillEnable: {},
      effective: {},
      moves: [],
      performs: [],
    };
    const { host } = render(<CharacterSheet open character={empty} onClose={() => undefined} />);
    clickTab(host, "武学");
    expect(host.querySelector("[data-testid=char-combat]")).not.toBeNull();
    expect(host.textContent).toContain("尚未学会武功");
    expect(host.textContent).toContain("当面请教");
  });

  it("行囊页：衣甲佩挂置顶；行囊展开后提交意图", () => {
    const items: string[] = [];
    const { host } = render(
      <CharacterSheet
        open
        character={CHARACTER}
        onClose={() => undefined}
        onInventoryAction={(action, id) => items.push(`${action}:${id}`)}
      />,
    );
    clickTab(host, "行囊");
    expect(host.textContent).toContain("衣甲");
    expect(host.textContent).toContain("□粗布衣");
    act(() =>
      host
        .querySelector<HTMLButtonElement>('[data-testid="inv-row-cloth_armor"] .char-inv-toggle')!
        .click(),
    );
    expect(host.textContent).toContain("旧皮缝制");
    expect(host.textContent).toContain("防御 +3");
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>(".chip")]
        .find((c) => c.textContent === "佩上")!
        .click(),
    );
    expect(items).toEqual(["equip:cloth_armor"]);
  });

  it("档案页：仪容、性别、改名与放弃", () => {
    let renamed = "";
    let discarded = 0;
    const { host } = render(
      <CharacterSheet
        open
        character={CHARACTER}
        onClose={() => undefined}
        onRename={(name) => (renamed = name)}
        onDiscard={() => (discarded += 1)}
      />,
    );
    clickTab(host, "档案");
    expect(host.textContent).toContain("仪容");
    expect(host.textContent).toContain("男子");
    expect(host.textContent).toContain("粗布衣");
    expect(host.textContent).toContain("性别");
    expect(host.textContent).toContain("男");
    const input = host.querySelector<HTMLInputElement>("#char-rename-input")!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, "陆大风");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>(".chip")]
        .find((b) => b.textContent === "更名")!
        .click(),
    );
    expect(renamed).toBe("陆大风");
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>(".chip")]
        .find((b) => b.textContent === "放弃角色")!
        .click(),
    );
    expect(discarded).toBe(1);
  });
});
