// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { DIR_LABEL, ExitPad } from "./ExitPad.js";
import { EntitySheet } from "./EntitySheet.js";
import { SceneView } from "./SceneView.js";
import type { SceneRoom } from "../lib/sceneTypes.js";

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

const ROOM: SceneRoom = {
  id: "village_square",
  area: "newbie",
  name: "村口广场",
  shortDesc: "晒谷场上稻香未散。",
  longDesc: "晒谷场上稻香未散，青石被日头晒得发白。往南是村中客栈，屋脊上炊烟正起。",
  canSleep: false,
  exits: [
    { dir: "north", roomId: "village_dojo" },
    { dir: "south", roomId: "village_inn" },
    { dir: "east", roomId: "village_general" },
  ],
  npcs: [
    { id: "master_wang", name: "王师傅", kind: "apprentice_master" },
    { id: "village_guard", name: "村口守卫", kind: "npc" },
  ],
  items: [{ id: "iron_sword", name: "铁剑", kind: "weapon" }],
  actions: [{ command: "webclient", label: "查看全局" }],
};

describe("ExitPad（方位罗盘）", () => {
  it("只显示可前往方向：北行在上、南行在下、中心为当前房间；无出口方向不渲染", () => {
    const { host } = render(
      <ExitPad exits={ROOM.exits} roomName={ROOM.name} onGo={() => undefined} />,
    );
    const north = host.querySelector('[data-dir="north"]');
    const south = host.querySelector('[data-dir="south"]');
    const east = host.querySelector('[data-dir="east"]');
    const northeast = host.querySelector('[data-dir="northeast"]');
    expect(north?.textContent).toBe(DIR_LABEL.north);
    expect(south?.textContent).toBe(DIR_LABEL.south);
    expect(east?.textContent).toBe(DIR_LABEL.east);
    expect(northeast).toBeNull(); // 无出口方向不渲染
    // 位置关系：北在第 1 行、南在第 3 行、中心在中间行
    const rows = [...host.querySelectorAll(".exit-row")];
    expect(rows[0]?.textContent).toContain(DIR_LABEL.north);
    expect(rows[2]?.textContent).toContain(DIR_LABEL.south);
    expect(rows[1]?.textContent).toContain("村口广场");
    expect(host.querySelector('[data-testid="exit-center"]')?.textContent).toContain("村口广场");
  });

  it("点击出口回调方向", () => {
    let dir = "";
    const { host } = render(
      <ExitPad exits={ROOM.exits} roomName={ROOM.name} onGo={(d) => (dir = d)} />,
    );
    act(() => host.querySelector<HTMLButtonElement>('[data-dir="north"]')!.click());
    expect(dir).toBe("north");
  });
});

describe("SceneView（叙事优先 + 见闻 Tab）", () => {
  it("渲染标题与叙事长文，出口与人物可交互", () => {
    let selected = "";
    const { host } = render(
      <SceneView
        room={ROOM}
        onGo={() => undefined}
        onSelectNpc={(n) => (selected = n.name)}
        onSelectItem={() => undefined}
        onAction={() => undefined}
      />,
    );
    expect(host.querySelector(".scene-title")?.textContent).toBe("村口广场");
    expect(host.textContent).toContain("稻香未散");
    expect(host.textContent).toContain("此地人物");
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>(".chip")]
        .find((c) => c.textContent === "王师傅")!
        .click(),
    );
    expect(selected).toBe("王师傅");
  });
});

describe("EntitySheet（能力→动作）", () => {
  const actions = (entity: Parameters<typeof EntitySheet>[0]["entity"]): string[] => {
    const { host } = render(
      <EntitySheet open entity={entity} onAction={() => undefined} onClose={() => undefined} />,
    );
    const labels = [
      ...host.querySelectorAll<HTMLButtonElement>("[data-testid=entity-actions] .chip"),
    ].map((b) => b.textContent ?? "");
    host.remove();
    return labels;
  };

  it("商贩→交易；师父→交谈+拜师；任务→请托；战斗→较量；物品→拾取", () => {
    expect(actions({ id: "general_shop", name: "杂货铺掌柜", kind: "vendor" })).toEqual([
      "交谈",
      "交易",
    ]);
    expect(actions({ id: "master_wang", name: "王师傅", kind: "apprentice_master" })).toEqual([
      "交谈",
      "拜师",
    ]);
    expect(actions({ id: "shen_buotou", name: "沈捕头", kind: "quest_giver" })).toEqual([
      "交谈",
      "请托",
    ]);
    expect(actions({ id: "wild_dog", name: "野狗", kind: "battle" })).toEqual(["较量"]);
    expect(actions({ id: "iron_sword", name: "铁剑", kind: "weapon" })).toEqual(["拾取"]);
  });
});
