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
  const vitalsMax: Record<VitalKey, number> = {
    qi: 420,
    jing: 380,
    jingli: 300,
    neili: 200,
    food: 400,
    water: 350,
  };

  it("渲染气/精/精力/内力（当前/上限双值）+ 银两独立徽章", () => {
    const { host } = render(<StatusBar vitals={vitals} vitalsMax={vitalsMax} silver={12} />);
    expect(host.textContent).toContain("气");
    expect(host.textContent).toContain("精");
    expect(host.textContent).toContain("精力");
    expect(host.textContent).toContain("内力");
    expect(host.textContent).toContain("银两");
    expect(host.textContent).toContain("96/420");
    expect(host.textContent).toContain("80/380");
    expect(host.textContent).toContain("64/300");
    expect(host.textContent).toContain("40/200");
    expect(host.textContent).toContain("12");
    // 银两是独立徽章区（货币非状态）
    expect(host.querySelector('[data-testid="status-silver"]')).not.toBeNull();
  });

  it("数据未就绪时显示占位符", () => {
    const { host } = render(<StatusBar vitals={null} vitalsMax={null} silver={null} />);
    const dashes = host.querySelectorAll("b");
    expect(dashes.length).toBe(5);
    dashes.forEach((b) => expect(b.textContent).toBe("–"));
  });
});
