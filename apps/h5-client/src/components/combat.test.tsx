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
  enemies: [{ id: "b0", name: "劫道匪徒", qi: 80, maxQi: 120, down: false }],
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

describe("CombatView（自动战 + 抓时机）", () => {
  it("渲染双方状态与战报；无普攻，绝招/逃跑发意图", () => {
    const commands: Array<{ action: string; performId?: string }> = [];
    const { host } = render(<CombatView state={STATE} onAction={(c) => commands.push(c)} />);
    expect(host.textContent).toContain("劫道匪徒");
    expect(host.textContent).toContain("气");
    expect(host.textContent).toContain("180/200");
    expect(host.textContent).toContain("交手自行推进");
    expect(host.querySelector("[data-testid=combat-log]")?.textContent).toContain("追风破");
    expect([...host.querySelectorAll(".chip")].some((c) => c.textContent === "普攻")).toBe(false);

    const chips = [
      ...host.querySelectorAll<HTMLButtonElement>("[data-testid=combat-actions] .chip"),
    ];
    act(() => chips.find((c) => c.textContent === "疾风斩")!.click());
    act(() => chips.find((c) => c.textContent === "逃跑")!.click());
    expect(commands).toEqual([{ action: "perform", performId: "swift_slash" }, { action: "flee" }]);
  });

  it("多敌并列血条，倒下者标已伏", () => {
    const { host } = render(
      <CombatView
        state={{
          ...STATE,
          enemyName: "野狗、瘦狗",
          enemies: [
            { id: "b0", name: "野狗", qi: 10, maxQi: 50, down: false },
            { id: "b1", name: "瘦狗", qi: 0, maxQi: 40, down: true },
          ],
        }}
        onAction={() => undefined}
      />,
    );
    expect(host.querySelector("[data-testid=combat-foe-b0]")?.textContent).toContain("野狗");
    expect(host.querySelector("[data-testid=combat-foe-b1]")?.textContent).toContain("已伏");
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

  it("结果横幅收束（wuxia 文案），离去可点", () => {
    let dismissed = false;
    const { host } = render(
      <CombatView
        state={{
          ...STATE,
          inCombat: false,
          result: "win",
          reward: { exp: 6, potential: 2, silver: 3, drops: [] },
        }}
        onAction={() => undefined}
        onDismiss={() => {
          dismissed = true;
        }}
      />,
    );
    expect(host.querySelector("[data-testid=combat-result]")?.textContent).toContain("尘埃落定");
    expect(host.querySelector("[data-testid=combat-actions]")).toBeNull();
    expect(host.querySelector("[data-testid=combat-reward]")?.textContent).toContain("阅历 6");
    act(() => host.querySelector<HTMLButtonElement>("[data-testid=combat-leave]")!.click());
    expect(dismissed).toBe(true);
  });

  it("非战斗状态不渲染", () => {
    const { host } = render(
      <CombatView state={{ ...STATE, inCombat: false }} onAction={() => undefined} />,
    );
    expect(host.querySelector("[data-testid=combat]")).toBeNull();
  });
});
