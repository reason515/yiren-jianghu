// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { ChoiceRow } from "./ChoiceRow.js";

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

describe("ChoiceRow（分段控件）", () => {
  it("渲染选项；选中态带 .on 与 aria-selected", () => {
    const { host } = render(
      <ChoiceRow
        label="榜单"
        value="growth"
        onChange={() => undefined}
        options={[
          { value: "growth", label: "成长榜" },
          { value: "season_pvp", label: "论剑榜" },
        ]}
      />,
    );
    const buttons = [...host.querySelectorAll<HTMLButtonElement>(".seg-btn")];
    expect(buttons.map((b) => b.textContent)).toEqual(["成长榜", "论剑榜"]);
    expect(buttons[0]!.classList.contains("on")).toBe(true);
    expect(buttons[0]!.getAttribute("aria-selected")).toBe("true");
    expect(buttons[1]!.getAttribute("aria-selected")).toBe("false");
    expect(host.querySelector(".seg")?.getAttribute("aria-label")).toBe("榜单");
  });

  it("点击未选中项触发 onChange；禁用项不可触发", () => {
    let changed = "";
    const { host } = render(
      <ChoiceRow
        label="法门"
        value="study"
        onChange={(v) => (changed = v)}
        options={[
          { value: "study", label: "修炼" },
          { value: "quest", label: "行侠", disabled: true },
        ]}
      />,
    );
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>(".seg-btn")]
        .find((b) => b.textContent === "行侠")!
        .click(),
    );
    expect(changed).toBe(""); // 禁用项不触发
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>(".seg-btn")]
        .find((b) => b.textContent === "修炼")!
        .click(),
    );
    expect(changed).toBe("study");
    const quest = [...host.querySelectorAll<HTMLButtonElement>(".seg-btn")].find(
      (b) => b.textContent === "行侠",
    )!;
    expect(quest.disabled).toBe(true);
  });
});
