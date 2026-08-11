// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { ExertSheet } from "./ExertSheet.js";
import type { FieldExertOption } from "../lib/fieldExert.js";

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

const OPTIONS: FieldExertOption[] = [
  {
    id: "cure_wound",
    name: "玄门疗伤",
    skillId: "xuanmen_force",
    kind: "cure",
    cost: { qi: 0, jing: 5, neili: 20 },
  },
  {
    id: "force_calm_spirit",
    name: "静心回神",
    skillId: "xuanmen_force",
    kind: "heal_jing",
    cost: { qi: 0, jing: 0, neili: 18 },
  },
];

describe("ExertSheet", () => {
  it("列出运功项并提交 performId", () => {
    const ids: string[] = [];
    const { host } = render(
      <ExertSheet
        open
        options={OPTIONS}
        onClose={() => undefined}
        onExert={(id) => ids.push(id)}
      />,
    );
    expect(host.querySelector("[data-testid=exert-sheet]")).toBeTruthy();
    expect(host.textContent).toContain("玄门疗伤");
    expect(host.textContent).toContain("回精");
    const btn = host.querySelector<HTMLButtonElement>("[data-testid=exert-row-cure_wound] .chip")!;
    act(() => btn.click());
    expect(ids).toEqual(["cure_wound"]);
  });

  it("空态提示", () => {
    const { host } = render(
      <ExertSheet open options={[]} onClose={() => undefined} onExert={() => undefined} />,
    );
    expect(host.querySelector("[data-testid=exert-empty]")?.textContent).toContain("尚未学会");
  });
});
