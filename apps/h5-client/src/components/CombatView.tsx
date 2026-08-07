import type { JSX } from "react";
import { Bar } from "./base/Bar.js";
import { Chip } from "./base/Chip.js";
import type { CombatViewProps } from "../lib/combatTypes.js";

/** 手动战斗视图（mobile-ui：看局势→抓时机；服务端结算，客户端只发动作意图）。 */
export function CombatView({ state, onAction }: CombatViewProps): JSX.Element | null {
  if (!state.inCombat && !state.result) return null;

  return (
    <div className="combat" data-testid="combat" role="region" aria-label="战局">
      <div className="combat-sides">
        <div className="combat-side foe">
          <span className="combat-name">{state.enemyName}</span>
          <Bar value={state.enemyQi} max={state.enemyMaxQi} tone="qi" />
        </div>
        <div className="combat-side self">
          <span className="combat-name">你</span>
          <Bar value={state.playerQi} max={state.playerMaxQi} tone="qi" label="气" />
          <Bar value={state.playerJing} max={state.playerMaxJing} tone="jing" label="精" />
          <Bar value={state.playerNeili} max={state.playerMaxNeili} tone="neili" label="内力" />
        </div>
      </div>

      <div className="combat-log" aria-live="polite" data-testid="combat-log">
        {state.log.slice(-40).map((line) => (
          <p
            key={line.id}
            className={`combat-line${line.kind === "perform" ? " hl" : ""}${line.kind === "danger" ? " dg" : ""}`}
          >
            {line.text}
          </p>
        ))}
      </div>

      {state.result ? (
        <>
          <p className="combat-result" data-testid="combat-result">
            {RESULT_TEXT[state.result]}
          </p>
          {state.reward && (
            <p className="combat-reward" data-testid="combat-reward">
              所得：阅历 {state.reward.exp} · 潜能 {state.reward.potential} · 银两{" "}
              {state.reward.silver}
            </p>
          )}
        </>
      ) : (
        <div className="combat-actions" data-testid="combat-actions">
          <Chip label="普攻" variant="action" onClick={() => onAction({ action: "attack" })} />
          {state.performs.map((p) => (
            <Chip
              key={p.id}
              label={p.name}
              variant="action"
              disabled={!p.ready}
              onClick={() => onAction({ action: "perform", performId: p.id })}
            />
          ))}
          <Chip label="回气" variant="action" onClick={() => onAction({ action: "recover" })} />
          <Chip label="逃跑" variant="danger" onClick={() => onAction({ action: "flee" })} />
        </div>
      )}
    </div>
  );
}

const RESULT_TEXT: Record<"win" | "lose" | "escape" | "draw", string> = {
  win: "尘埃落定——你赢了这一场。",
  lose: "力竭而退，来日再战。",
  escape: "全身而退，江湖路长。",
  draw: "未分胜负，各自散去。",
};
