// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { ArtPlaceholder } from "../components/ArtPlaceholder.js";
import { latestPerformLine } from "./effects.js";
import { createSoundPlayer, type SoundEvent } from "./sound.js";

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

describe("ArtPlaceholder（插画占位）", () => {
  it("渲染首字印章 + 色调/尺寸类 + aria", () => {
    const { host } = render(<ArtPlaceholder text="王师傅" tone="cinnabar" size="sm" />);
    const el = host.querySelector(".art-placeholder")!;
    expect(el.textContent).toBe("王");
    expect(el.classList.contains("cinnabar")).toBe(true);
    expect(el.classList.contains("sm")).toBe(true);
    expect(el.getAttribute("aria-label")).toBe("王师傅（占位插画）");
  });

  it("空文本回退「侠」", () => {
    const { host } = render(<ArtPlaceholder text="" />);
    expect(host.querySelector(".art-placeholder")?.textContent).toBe("侠");
  });
});

describe("sound（环境音占位）", () => {
  it("enabled=false 不触发实现（no-op）", () => {
    let calls = 0;
    const player = createSoundPlayer({ enabled: false, impl: { play: () => (calls += 1) } });
    player.play("combat.perform");
    expect(calls).toBe(0);
  });

  it("enabled=true 转发事件", () => {
    const heard: SoundEvent[] = [];
    const player = createSoundPlayer({ enabled: true, impl: { play: (e) => heard.push(e) } });
    player.play("combat.perform");
    player.play("ui.tap");
    expect(heard).toEqual(["combat.perform", "ui.tap"]);
  });
});

describe("effects（战斗演出）", () => {
  it("返回最近一条绝招行；无绝招返回 undefined", () => {
    const lines = [
      { id: 1, kind: "normal" },
      { id: 2, kind: "perform" },
      { id: 3, kind: "damage" },
      { id: 4, kind: "perform" },
    ];
    expect(latestPerformLine(lines)?.id).toBe(4);
    expect(latestPerformLine([{ id: 1, kind: "normal" }])).toBeUndefined();
  });
});
