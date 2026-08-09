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
      description: "吐纳凝神，以内息护体。",
      level: 12,
      maxLevel: 300,
      practicePoints: 4,
    },
    {
      id: "xuanmen_sword",
      name: "玄门剑法",
      category: "weapon",
      level: 9,
      maxLevel: 300,
      practicePoints: 2,
    },
  ],
  equipment: [{ slot: "weapon", item: { id: "iron_sword", name: "铁剑" } }, { slot: "armor" }],
  inventory: [
    { id: "cloth_armor", name: "粗布衣", kind: "armor", quantity: 1, equipped: false },
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
  it("摘要带语义标签（经验/可用潜能/银两），默认身势页签", () => {
    const { host } = render(
      <CharacterSheet open character={CHARACTER} onClose={() => undefined} />,
    );
    expect(host.textContent).toContain("经验");
    expect(host.textContent).toContain("1200");
    expect(host.textContent).toContain("可用潜能");
    expect(host.textContent).toContain("88");
    expect(host.textContent).toContain("银两");
    expect(host.textContent).toContain("25");
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("身势");
  });

  it("身势页：行止当前/上限细轨 + 四维当前/先天", () => {
    const { host } = render(
      <CharacterSheet open character={CHARACTER} onClose={() => undefined} />,
    );
    expect(host.textContent).toContain("气血");
    expect(host.textContent).toContain("92");
    expect(host.textContent).toContain("420");
    expect(
      host.querySelectorAll('.char-vital [role="progressbar"], .char-vital').length,
    ).toBeGreaterThan(0);
    expect(host.querySelector(".char-vital-cur")?.textContent).toBe("92");
    expect(host.querySelector(".char-vital-max")?.textContent).toBe("420");
    expect(host.textContent).toContain("膂力");
    expect(host.textContent).toContain("当前 25 · 先天 20");
    expect(host.textContent).toContain("身法");
    expect(host.textContent).toContain("当前 15 · 先天 20");
  });

  it("武学页：展开后见演练点、描述与学武动作", () => {
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
    expect(host.textContent).toContain("Lv 12");
    expect(host.textContent).toContain("演练点 4");
    expect(host.querySelector(".char-skill-name.skill-force")?.textContent).toContain("玄门内功");
    // 未展开时无动作 chip
    expect([...host.querySelectorAll(".chip")].some((c) => c.textContent === "演练")).toBe(false);

    const toggle = host.querySelector<HTMLButtonElement>(
      '[data-testid="skill-row-xuanmen_force"] .char-skill-toggle',
    )!;
    act(() => toggle.click());
    expect(host.textContent).toContain("吐纳凝神");
    const clickChip = (label: string) => {
      const button = [...host.querySelectorAll<HTMLButtonElement>(".chip")].find(
        (candidate) => candidate.textContent === label,
      )!;
      act(() => button.click());
    };
    clickChip("请教");
    clickChip("演练");
    expect(skills).toEqual(["learn:xuanmen_force", "practice:xuanmen_force"]);
  });

  it("行囊页：佩挂置顶；行囊展开后提交意图", () => {
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
    expect(host.textContent).toContain("当前佩挂");
    expect(host.textContent).toContain("兵器");
    expect(host.textContent).toContain("铁剑");
    expect(host.textContent).toContain("×3");
    expect(host.querySelector(".char-inv-name.item-food")?.textContent).toContain("干粮");

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
    act(() =>
      host
        .querySelector<HTMLButtonElement>('[data-testid="inv-row-dry_food"] .char-inv-toggle')!
        .click(),
    );
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>(".chip")]
        .find((c) => c.textContent === "使用")!
        .click(),
    );
    expect(items).toEqual(["equip:cloth_armor", "use:dry_food"]);
  });

  it("档案页：性别、改名与放弃入口", () => {
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
    const renameBtn = [...host.querySelectorAll<HTMLButtonElement>(".chip")].find(
      (b) => b.textContent === "更名",
    )!;
    expect(renameBtn.disabled).toBe(false);
    act(() => renameBtn.click());
    expect(renamed).toBe("陆大风");

    const discardBtn = [...host.querySelectorAll<HTMLButtonElement>(".chip")].find(
      (b) => b.textContent === "放弃角色",
    )!;
    expect(discardBtn.classList.contains("danger")).toBe(true);
    act(() => discardBtn.click());
    expect(discarded).toBe(1);
  });
});
