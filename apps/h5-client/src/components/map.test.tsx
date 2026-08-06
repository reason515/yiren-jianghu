// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { MapSheet, type MapRoomView } from "./MapSheet.js";

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

describe("MapSheet（区域舆图）", () => {
  it("渲染节点与边；当前节点玉色高亮；北标与区域标签", () => {
    const { host } = render(
      <MapSheet
        open
        rooms={ROOMS}
        edges={EDGES}
        areaLabel="青石村"
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
});
