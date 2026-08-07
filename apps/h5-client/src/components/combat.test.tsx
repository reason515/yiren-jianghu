// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { CombatView } from "./CombatView.js";
import type { CombatState } from "../lib/combatTypes.js";

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

const STATE: CombatState = {
  enemyName: "劫道匪徒",
  enemyQi: 80,
  enemyMaxQi: 120,
  playerQi: 180,
  playerMaxQi: 200,
  playerJing: 90,
  playerMaxJing: 100,
  playerNeili: 60,
  playerMaxNeili: 100,
  log: [
    { id: 1, text: "剑未至，风先裂——你抢先进攻，匪徒仓促招架。" },
    { id: 2, text: "你觑准破绽，一招追风破正中敌手胸口。", kind: "perform" },
  ],
  performs: [
    { id: "swift_slash", name: "疾风斩", ready: true },
    { id: "zhufeng_break", name: "追风破", ready: false },
  ],
  inCombat: true,
};

describe("CombatView（手动战斗）", () => {
  it("渲染双方状态与战报，动作按钮发命令", () => {
    const commands: Array<{ action: string; performId?: string }> = [];
    const { host } = render(<CombatView state={STATE} onAction={(c) => commands.push(c)} />);
    expect(host.textContent).toContain("劫道匪徒");
    expect(host.textContent).toContain("气 180/200");
    expect(host.querySelector("[data-testid=combat-log]")?.textContent).toContain("追风破");

    const chips = [
      ...host.querySelectorAll<HTMLButtonElement>("[data-testid=combat-actions] .chip"),
    ];
    act(() => chips.find((c) => c.textContent === "普攻")!.click());
    act(() => chips.find((c) => c.textContent === "疾风斩")!.click());
    act(() => chips.find((c) => c.textContent === "逃跑")!.click());
    expect(commands).toEqual([
      { action: "attack" },
      { action: "perform", performId: "swift_slash" },
      { action: "flee" },
    ]);
  });

  it("绝招未就绪（冷却/消耗）禁用；逃跑为危险动作", () => {
    const { host } = render(<CombatView state={STATE} onAction={() => undefined} />);
    const chips = [
      ...host.querySelectorAll<HTMLButtonElement>("[data-testid=combat-actions] .chip"),
    ];
    const notReady = chips.find((c) => c.textContent === "追风破")!;
    expect(notReady.disabled).toBe(true);
    expect(notReady.classList.contains("danger")).toBe(false);
    expect(chips.find((c) => c.textContent === "逃跑")!.classList.contains("danger")).toBe(true);
  });

  it("结果横幅收束（wuxia 文案），不再显示动作按钮", () => {
    const { host } = render(
      <CombatView
        state={{
          ...STATE,
          inCombat: false,
          result: "win",
          reward: { exp: 6, potential: 2, silver: 3, drops: [] },
        }}
        onAction={() => undefined}
      />,
    );
    expect(host.querySelector("[data-testid=combat-result]")?.textContent).toContain("尘埃落定");
    expect(host.querySelector("[data-testid=combat-actions]")).toBeNull();
    expect(host.querySelector("[data-testid=combat-reward]")?.textContent).toContain("阅历 6");
  });

  it("非战斗状态不渲染", () => {
    const { host } = render(
      <CombatView state={{ ...STATE, inCombat: false }} onAction={() => undefined} />,
    );
    expect(host.querySelector("[data-testid=combat]")).toBeNull();
  });
});
