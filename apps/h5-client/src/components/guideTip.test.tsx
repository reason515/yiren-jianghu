// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { GuideTip } from "./GuideTip.js";

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

describe("GuideTip（新手引导轻提示）", () => {
  it("渲染引导文案与「知道了」；点击关闭回调", () => {
    let dismissed = 0;
    const { host } = render(
      <GuideTip text="风起青萍之末。先到村口听消息。" onDismiss={() => (dismissed += 1)} />,
    );
    expect(host.querySelector("[data-testid=guide-tip]")?.textContent).toContain("风起青萍");
    expect(host.textContent).toContain("知道了");
    act(() => host.querySelector<HTMLButtonElement>(".guide-dismiss")!.click());
    expect(dismissed).toBe(1);
  });
});
