// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { MapSheet, type MapRoomView } from "./MapSheet.js";
import type { WorldNodeView, WorldRoadView } from "../lib/mapTypes.js";

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

const ROOMS: MapRoomView[] = [
  { id: "village_start", name: "老屋·旧榻", grid: [0, 0], state: "visited" },
  { id: "village_square", name: "村口广场", grid: [1, 0], state: "current" },
  { id: "village_dojo", name: "村中武馆", grid: [1, -1], state: "visited" },
  { id: "city_gate", name: "城门", grid: [3, 0], state: "locked" },
];

const EDGES = [
  { from: "village_start", to: "village_square" },
  { from: "village_square", to: "village_dojo" },
];

const WORLD_NODES: WorldNodeView[] = [
  {
    id: "newbie",
    name: "青石村",
    kind: "village",
    geo: [-36, 78],
    scale: "village",
    state: "current",
  },
  {
    id: "city",
    name: "青石城",
    kind: "metropolis",
    geo: [0, 0],
    scale: "capital",
    state: "known",
  },
  {
    id: "sect",
    name: "玄门剑宗",
    kind: "sect",
    geo: [28, -86],
    scale: "pass",
    state: "known",
  },
];

const WORLD_ROADS: WorldRoadView[] = [
  { from: "newbie", to: "city", mode: "road" },
  { from: "city", to: "sect", mode: "road" },
];

describe("MapSheet（区域舆图）", () => {
  it("默认本域：渲染节点与边；当前节点玉色高亮；北标与区域标签", () => {
    const { host } = render(
      <MapSheet
        open
        rooms={ROOMS}
        edges={EDGES}
        areaLabel="青石村"
        worldNodes={WORLD_NODES}
        worldRoads={WORLD_ROADS}
        onNavigate={() => undefined}
        onClose={() => undefined}
      />,
    );
    const nodes = host.querySelectorAll("[data-testid=map-nodes] .map-node");
    expect(nodes.length).toBe(4);
    expect(host.querySelector(".map-node.current")?.getAttribute("aria-label")).toContain("在此");
    expect(host.querySelectorAll("[data-testid=map-edges] path").length).toBe(2);
    expect(host.querySelector(".map-north")?.textContent).toBe("北");
    expect(host.textContent).toContain("青石村");
    expect(host.querySelector(".seg-btn.on")?.textContent).toBe("本域");
  });

  it("锁定节点不可导航；可前往节点点击回调", () => {
    const navs: string[] = [];
    const { host } = render(
      <MapSheet
        open
        rooms={ROOMS}
        edges={EDGES}
        onNavigate={(id) => navs.push(id)}
        onClose={() => undefined}
      />,
    );
    const clickNode = (id: string): void =>
      act(() => {
        host
          .querySelector(`[data-map-node="${id}"]`)!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    clickNode("city_gate");
    expect(navs).toEqual([]);
    clickNode("village_dojo");
    expect(navs).toEqual(["village_dojo"]);
  });

  it("控件存在（缩小/放大/回到位置）", () => {
    const { host } = render(
      <MapSheet
        open
        rooms={ROOMS}
        edges={EDGES}
        onNavigate={() => undefined}
        onClose={() => undefined}
      />,
    );
    const labels = [...host.querySelectorAll<HTMLButtonElement>(".map-controls button")].map((b) =>
      b.getAttribute("aria-label"),
    );
    expect(labels).toEqual(["缩小", "放大", "回到位置"]);
  });

  it("Tab 切换天下图；点选远方回调；点选所在地切回本域", () => {
    const selected: string[] = [];
    const { host } = render(
      <MapSheet
        open
        rooms={ROOMS}
        edges={EDGES}
        areaLabel="青石村"
        worldNodes={WORLD_NODES}
        worldRoads={WORLD_ROADS}
        onNavigate={() => undefined}
        onSelectWorldArea={(id) => selected.push(id)}
        onClose={() => undefined}
      />,
    );
    act(() => {
      [...host.querySelectorAll<HTMLButtonElement>(".seg-btn")]
        .find((b) => b.textContent === "天下")!
        .click();
    });
    expect(host.querySelector("[data-testid=world-map-svg]")).toBeTruthy();
    expect(host.querySelectorAll("[data-testid=world-map-nodes] .map-node").length).toBe(3);
    expect(host.querySelectorAll("[data-testid=world-map-roads] path").length).toBe(2);
    expect(host.textContent).toContain("只可观望");

    act(() => {
      host
        .querySelector('[data-world-node="city"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(selected).toEqual(["city"]);

    act(() => {
      host
        .querySelector('[data-world-node="newbie"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(host.querySelector("[data-testid=map-svg]")).toBeTruthy();
    expect(host.querySelector(".seg-btn.on")?.textContent).toBe("本域");
  });
});
