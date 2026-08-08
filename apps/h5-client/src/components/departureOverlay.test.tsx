// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { DepartureOverlay } from "./DepartureOverlay.js";

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

describe("DepartureOverlay（起程过场）", () => {
  it("渲染老屋晨光叙事并回显角色名", () => {
    const { host } = render(<DepartureOverlay name="叶孤舟" onDone={() => undefined} />);
    expect(host.textContent).toContain("老屋晨光");
    expect(host.textContent).toContain("鸡鸣三遍，晨光透进窗纸");
    expect(host.textContent).toContain("叶孤舟");
    expect(host.textContent).toContain("起身推门");
  });

  it("点击起身推门回调 onDone", () => {
    let done = false;
    const { host } = render(<DepartureOverlay name="叶孤舟" onDone={() => (done = true)} />);
    const btn = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
      b.textContent?.includes("起身推门"),
    )!;
    act(() => btn.click());
    expect(done).toBe(true);
  });
});
