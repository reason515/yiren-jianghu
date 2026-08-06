// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act, useState, type JSX } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { TacticEditor } from "./TacticEditor.js";
import type { TacticEditorProps } from "./TacticEditor.js";
import type { TacticTemplateDraft } from "../lib/tacticTypes.js";

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

const TEMPLATES: TacticTemplateDraft[] = [
  {
    id: "t1",
    version: 1,
    name: "稳妥历练",
    rules: [
      {
        id: "r1",
        conditions: [{ id: "c1", type: "self_qi_below_pct", value: 40 }],
        action: { kind: "recover" },
      },
      { id: "r2", conditions: [], action: { kind: "attack" } },
    ],
    defaultAction: { kind: "attack" },
    isDefaultPvp: false,
  },
  {
    id: "t2",
    version: 1,
    name: "论剑激进",
    rules: [],
    defaultAction: { kind: "attack" },
    isDefaultPvp: true,
  },
];

const PERFORMS = [
  { id: "swift_slash", name: "疾风斩" },
  { id: "zhufeng_break", name: "追风破" },
];

function props(overrides: Partial<TacticEditorProps> = {}): TacticEditorProps {
  return {
    templates: TEMPLATES,
    activeId: "t1",
    performs: PERFORMS,
    onSelect: () => undefined,
    onChange: () => undefined,
    onAddTemplate: () => undefined,
    onDeleteTemplate: () => undefined,
    ...overrides,
  };
}

/** 受控 harness：onChange 更新模板状态，UI 随变更重渲染（模拟真实数据流）。 */
function Controlled({ capture }: { capture?: (t: TacticTemplateDraft) => void }): JSX.Element {
  const [templates, setTemplates] = useState(TEMPLATES);
  return (
    <TacticEditor
      templates={templates}
      activeId="t1"
      performs={PERFORMS}
      onSelect={() => undefined}
      onChange={(t) => {
        capture?.(t);
        setTemplates((prev) => prev.map((x) => (x.id === t.id ? t : x)));
      }}
      onAddTemplate={() => undefined}
      onDeleteTemplate={() => undefined}
    />
  );
}

describe("TacticEditor（战术模板）", () => {
  it("模板列表渲染与选中态；论剑默认标记", () => {
    const { host } = render(<TacticEditor {...props()} />);
    const names = [...host.querySelectorAll(".tactic-name")].map((b) => b.textContent);
    expect(names[0]).toBe("稳妥历练");
    expect(names[1]).toContain("论剑激进");
    expect(names[1]).toContain("论剑默认");
    expect(host.querySelector(".tactic-name.on")?.textContent).toBe("稳妥历练");
  });

  it("规则上移改变优先级（onChange 收到新顺序）", () => {
    const captured: TacticTemplateDraft[] = [];
    const { host } = render(<Controlled capture={(t) => captured.push(t)} />);
    // 第二条规则（r2）上移
    const rows = host.querySelectorAll("[data-testid=tactic-rule]");
    const secondRow = rows[1]!;
    act(() => secondRow.querySelector<HTMLButtonElement>('button[aria-label="上移"]')!.click());
    expect(captured[0]?.rules.map((r) => r.id)).toEqual(["r2", "r1"]);
  });

  it("添加条件/切换动作：UI 随变更重渲染（条件行与绝招选择出现）", () => {
    const { host } = render(<Controlled />);
    const firstRow = () => host.querySelectorAll("[data-testid=tactic-rule]")[0]!;
    // 添加条件 → 条件行出现
    act(() =>
      [...firstRow().querySelectorAll<HTMLButtonElement>(".tactic-cond-add .tactic-chip")]
        .find((b) => b.textContent === "敌气血低于")!
        .click(),
    );
    expect(firstRow().textContent).toContain("敌气血低于");
    // 动作切绝招 → 绝招选择出现；选疾风斩 → 选中态
    act(() =>
      [...firstRow().querySelectorAll<HTMLButtonElement>(".tactic-action .tactic-chip")]
        .find((b) => b.textContent === "绝招")!
        .click(),
    );
    const performChips = () => [
      ...firstRow().querySelectorAll<HTMLButtonElement>(".tactic-perform-list .tactic-chip"),
    ];
    expect(performChips().map((b) => b.textContent)).toEqual(["疾风斩", "追风破"]);
    act(() =>
      performChips()
        .find((b) => b.textContent === "疾风斩")!
        .click(),
    );
    expect(
      [...firstRow().querySelectorAll<HTMLButtonElement>(".tactic-perform-list .tactic-chip")]
        .find((b) => b.textContent === "疾风斩")!
        .classList.contains("on"),
    ).toBe(true);
  });

  it("无条件规则遮蔽后续 → 警告提示", () => {
    const { host } = render(<TacticEditor {...props()} />);
    expect(host.querySelector("[data-testid=tactic-warning]")?.textContent).toContain(
      "永远不会被触发",
    );
  });

  it("新建/删除模板回调", () => {
    let added = 0;
    let deleted = "";
    const { host } = render(
      <TacticEditor
        {...props({ onAddTemplate: () => (added += 1), onDeleteTemplate: (id) => (deleted = id) })}
      />,
    );
    act(() => [...host.querySelectorAll<HTMLButtonElement>(".tactic-delete")][0]!.click());
    expect(deleted).toBe("t1");
    act(() => host.querySelector<HTMLButtonElement>(".tactic-add")!.click());
    expect(added).toBe(1);
  });
});
