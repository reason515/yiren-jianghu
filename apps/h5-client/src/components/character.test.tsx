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

describe("CharacterSheet（角色面板）", () => {
  it("摘要带语义标签（经验/可用潜能/银两），不裸露命令名", () => {
    const { host } = render(
      <CharacterSheet open character={CHARACTER} onClose={() => undefined} />,
    );
    expect(host.textContent).toContain("经验 1200");
    expect(host.textContent).toContain("可用潜能 88");
    expect(host.textContent).toContain("银两 25");
  });

  it("四维标明当前/先天", () => {
    const { host } = render(
      <CharacterSheet open character={CHARACTER} onClose={() => undefined} />,
    );
    expect(host.textContent).toContain("膂力");
    expect(host.textContent).toContain("当前 25 · 先天 20");
    expect(host.textContent).toContain("身法");
    expect(host.textContent).toContain("当前 15 · 先天 20");
  });

  it("武功行含门类色、精通 Lv；装备槽与行囊分类渲染", () => {
    const { host } = render(
      <CharacterSheet open character={CHARACTER} onClose={() => undefined} />,
    );
    const skill = [...host.querySelectorAll(".char-skill-row")].find((r) =>
      r.textContent?.includes("玄门内功"),
    )!;
    expect(skill.classList.length).toBeGreaterThan(0);
    expect(host.querySelector(".char-skill-name.skill-force")?.textContent).toContain("玄门内功");
    expect(host.textContent).toContain("Lv 12");
    expect(host.textContent).toContain("兵器");
    expect(host.textContent).toContain("铁剑");
    expect(host.textContent).toContain("×3");
    expect(host.querySelector(".char-inv-name.item-food")?.textContent).toContain("干粮");
  });

  it("行止带语义标签，学武与行囊动作只回传服务端意图", () => {
    const skills: string[] = [];
    const items: string[] = [];
    const { host } = render(
      <CharacterSheet
        open
        character={CHARACTER}
        onClose={() => undefined}
        onSkillAction={(action, id) => skills.push(`${action}:${id}`)}
        onInventoryAction={(action, id) => items.push(`${action}:${id}`)}
      />,
    );
    expect(host.textContent).toContain("气血92");
    expect(host.textContent).toContain("精神84");
    const click = (label: string) => {
      const button = [...host.querySelectorAll<HTMLButtonElement>(".chip")].find(
        (candidate) => candidate.textContent === label,
      )!;
      act(() => button.click());
    };
    click("请教");
    click("演练");
    click("佩上");
    click("使用");
    expect(skills).toEqual(["learn:xuanmen_force", "practice:xuanmen_force"]);
    expect(items).toEqual(["equip:cloth_armor", "use:dry_food"]);
  });

  it("放弃角色入口为朱砂危险动作", () => {
    let discarded = 0;
    const { host } = render(
      <CharacterSheet
        open
        character={CHARACTER}
        onClose={() => undefined}
        onDiscard={() => (discarded += 1)}
      />,
    );
    const btn = [...host.querySelectorAll<HTMLButtonElement>(".chip")].find(
      (b) => b.textContent === "放弃角色",
    )!;
    expect(btn.classList.contains("danger")).toBe(true);
    act(() => btn.click());
    expect(discarded).toBe(1);
  });
});
