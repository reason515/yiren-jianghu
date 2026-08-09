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
  vitals: { qi: 92, jing: 84, jingli: 70, neili: 20, food: 230, water: 260 },
  vitalsMax: { qi: 420, jing: 380, jingli: 300, neili: 200, food: 400, water: 350 },
  attrs: {
    str: { cur: 25, base: 20 },
    int: { cur: 20, base: 20 },
    con: { cur: 20, base: 20 },
    dex: { cur: 15, base: 20 },
  },
  skills: [
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
    { id: "cloth_armor", name: "旧皮甲", kind: "armor", quantity: 1, equipped: false },
    { id: "dry_food", name: "干粮", kind: "food", quantity: 3, equipped: false },
    { id: "jinchuang_yao", name: "金创药", kind: "drug", quantity: 1, equipped: false },
  ],
};

function clickTab(host: HTMLDivElement, label: string): void {
  const btn = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (candidate) => candidate.textContent === label,
  )!;
  act(() => btn.click());
}

describe("CharacterSheet（角色面板）", () => {
  it("摘要带语义标签，默认状态页签，页签面板固定高度", () => {
    const { host } = render(
      <CharacterSheet open character={CHARACTER} onClose={() => undefined} />,
    );
    expect(host.textContent).toContain("经验");
    expect(host.textContent).toContain("1200");
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("状态");
    expect(host.querySelector('[data-testid="char-tab-panel"]')).not.toBeNull();
    expect(host.querySelector(".char-tabs")).not.toBeNull();
    expect(host.querySelector(".seg")).toBeNull();
  });

  it("状态页：行止当前/上限细轨 + 四维当前/先天", () => {
    const { host } = render(
      <CharacterSheet open character={CHARACTER} onClose={() => undefined} />,
    );
    expect(host.textContent).toContain("气血");
    expect(host.querySelector(".char-vital-cur")?.textContent).toBe("92");
    expect(host.querySelector(".char-vital-max")?.textContent).toBe("420");
    expect(host.textContent).toContain("当前 25 · 先天 20");
  });

  it("武学页：只列已学；不展示 0 级；展开后可演练", () => {
    const skills: string[] = [];
    const { host } = render(
      <CharacterSheet
        open
        character={CHARACTER}
        onClose={() => undefined}
        onSkillAction={(action, id) => skills.push(`${action}:${id}`)}
      />,
    );
    clickTab(host, "武学");
    expect(host.textContent).toContain("玄门内功");
    expect(host.textContent).not.toContain("未学之术");
    expect(host.textContent).toContain("演练点 4");

    const toggle = host.querySelector<HTMLButtonElement>(
      '[data-testid="skill-row-xuanmen_force"] .char-skill-toggle',
    )!;
    act(() => toggle.click());
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>(".chip")]
        .find((c) => c.textContent === "演练")!
        .click(),
    );
    expect(skills).toEqual(["practice:xuanmen_force"]);
  });

  it("武学页：全未学时给出空态说明", () => {
    const empty: CharacterView = {
      ...CHARACTER,
      skills: CHARACTER.skills.map((skill) => ({ ...skill, level: 0 })),
    };
    const { host } = render(<CharacterSheet open character={empty} onClose={() => undefined} />);
    clickTab(host, "武学");
    expect(host.textContent).toContain("你尚未学会任何武功");
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
    expect(host.textContent).toContain("粗布衣");
    act(() =>
      host
        .querySelector<HTMLButtonElement>('[data-testid="inv-row-cloth_armor"] .char-inv-toggle')!
        .click(),
    );
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
