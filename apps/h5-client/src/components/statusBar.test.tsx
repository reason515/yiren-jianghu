// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { StatusBar } from "./StatusBar.js";
import type { VitalKey } from "../lib/characterTypes.js";

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

describe("StatusBar（主界面顶栏生存状态）", () => {
  const vitals: Record<VitalKey, number> = {
    qi: 96,
    jing: 80,
    jingli: 64,
    neili: 40,
    food: 100,
    water: 100,
  };

  it("渲染气/精/精力/内力 + 银两，带语义标签与数值", () => {
    const { host } = render(<StatusBar vitals={vitals} silver={12} />);
    expect(host.textContent).toContain("气");
    expect(host.textContent).toContain("精");
    expect(host.textContent).toContain("精力");
    expect(host.textContent).toContain("内力");
    expect(host.textContent).toContain("银两");
    expect(host.textContent).toContain("96");
    expect(host.textContent).toContain("12");
  });

  it("数据未就绪时显示占位符", () => {
    const { host } = render(<StatusBar vitals={null} silver={null} />);
    const dashes = host.querySelectorAll("b");
    expect(dashes.length).toBe(5);
    dashes.forEach((b) => expect(b.textContent).toBe("–"));
  });
});
