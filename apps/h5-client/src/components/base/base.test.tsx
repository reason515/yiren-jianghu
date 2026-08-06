// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { Bar, Chip, Sheet, Toast } from "./index.js";

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

describe("Chip", () => {
  it("渲染标签并触发点击", () => {
    let clicked = 0;
    const { host } = render(<Chip label="查探" onClick={() => (clicked += 1)} />);
    const btn = host.querySelector<HTMLButtonElement>(".chip")!;
    expect(btn.textContent).toBe("查探");
    act(() => btn.click());
    expect(clicked).toBe(1);
  });

  it("disabled 不触发点击；danger 变体带危险类", () => {
    let clicked = 0;
    const { host } = render(
      <Chip label="放弃角色" variant="danger" disabled onClick={() => (clicked += 1)} />,
    );
    const btn = host.querySelector<HTMLButtonElement>(".chip")!;
    expect(btn.classList.contains("danger")).toBe(true);
    act(() => btn.click());
    expect(clicked).toBe(0);
  });
});

describe("Bar", () => {
  it("填充宽度与低值警示 + 数值语义标签", () => {
    const { host } = render(<Bar value={120} max={200} tone="qi" label="气" />);
    const bar = host.querySelector<HTMLDivElement>(".bar")!;
    const fill = host.querySelector<HTMLDivElement>(".bar-fill")!;
    expect(fill.style.width).toBe("60%");
    expect(bar.classList.contains("low")).toBe(false);
    expect(host.textContent).toContain("气 120/200");
  });

  it("低于 30% 标记 low（色彩+文案共同警示）", () => {
    const { host } = render(<Bar value={20} max={200} tone="qi" label="气" />);
    expect(host.querySelector(".bar")!.classList.contains("low")).toBe(true);
    expect(host.querySelector(".bar")!.getAttribute("aria-label")).toContain("20/200");
  });
});

describe("Toast", () => {
  it("有消息显示，无消息隐藏", () => {
    const { host } = render(<Toast message="金创药恢复 50 点气血" />);
    expect(host.querySelector(".toast")!.classList.contains("show")).toBe(true);
    expect(host.textContent).toContain("金创药");
  });
});

describe("Sheet", () => {
  it("open=false 不渲染", () => {
    const { host } = render(
      <Sheet open={false} title="行囊" onClose={() => undefined}>
        内容
      </Sheet>,
    );
    expect(host.querySelector(".sheet")).toBeNull();
  });

  it("open=true 渲染对话框与标题；关闭按钮触发 onClose；点遮罩不冒泡触发", () => {
    let closed = 0;
    const { host } = render(
      <Sheet open title="行囊" onClose={() => (closed += 1)}>
        <p>一柄铁剑</p>
      </Sheet>,
    );
    const sheet = host.querySelector<HTMLElement>("[data-testid=sheet]")!;
    expect(sheet.getAttribute("role")).toBe("dialog");
    expect(sheet.getAttribute("aria-label")).toBe("行囊");
    expect(sheet.textContent).toContain("一柄铁剑");

    act(() => host.querySelector<HTMLButtonElement>(".close")!.click());
    expect(closed).toBe(1);
  });
});
