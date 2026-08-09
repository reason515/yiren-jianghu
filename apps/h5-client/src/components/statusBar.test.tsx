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

  it("渲染气/精/精力/内力（细轨进度条 + 双色读数）+ 银两简牍印记", () => {
    const { host } = render(<StatusBar vitals={vitals} vitalsMax={vitalsMax} silver={12} />);
    expect(host.textContent).toContain("气");
    expect(host.textContent).toContain("精");
    expect(host.textContent).toContain("精力");
    expect(host.textContent).toContain("内力");
    expect(host.textContent).toContain("银两");
    expect(host.textContent).toContain("96");
    expect(host.textContent).toContain("420");
    expect(host.textContent).toContain("80");
    expect(host.textContent).toContain("380");
    expect(host.querySelectorAll('[role="progressbar"]').length).toBe(4);
    expect(host.querySelector(".status-vital.qi .status-vital-fill")).not.toBeNull();
    expect(host.querySelector(".status-cur")?.textContent).toBe("96");
    expect(host.querySelector(".status-max")?.textContent).toBe("420");
    // 银两是独立简牍区（货币非状态）
    expect(host.querySelector('[data-testid="status-silver"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="status-silver"] b')?.textContent).toBe("12");
  });

  it("低值时标记 low（色彩与读数共同警示）", () => {
    const low: Record<VitalKey, number> = { ...vitals, qi: 20 };
    const { host } = render(<StatusBar vitals={low} vitalsMax={vitalsMax} silver={1} />);
    expect(host.querySelector(".status-vital.qi.low")).not.toBeNull();
  });

  it("数据未就绪时显示占位符", () => {
    const { host } = render(<StatusBar vitals={null} vitalsMax={null} silver={null} />);
    const maxes = host.querySelectorAll(".status-max");
    expect(maxes.length).toBe(4);
    maxes.forEach((el) => expect(el.textContent).toBe("–"));
    expect(host.querySelector('[data-testid="status-silver"] b')?.textContent).toBe("–");
  });
});
