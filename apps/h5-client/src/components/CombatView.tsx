import { useEffect, useRef, type JSX } from "react";
import { Bar } from "./base/Bar.js";
import { Chip } from "./base/Chip.js";
import type { CombatResult, CombatViewProps } from "../lib/combatTypes.js";
import { latestPerformLine } from "../lib/effects.js";

/** 自动战视图：看局势 → 抓时机放绝招/回气/逃跑；普攻由上层节拍提交（DC-037/038）。 */
export function CombatView({
  state,
  onAction,
  onDismiss,
  busy = false,
}: CombatViewProps): JSX.Element | null {
  const logRef = useRef<HTMLDivElement>(null);
  const flashId = latestPerformLine(state.log)?.id;

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [state.log.length]);

  if (!state.inCombat && !state.result) return null;

  const enemies = state.enemies.length > 0 ? state.enemies : null;

  return (
    <div className="combat" data-testid="combat" role="region" aria-label="战局">
      <div className="combat-sides">
        <div className="combat-foes" data-testid="combat-foes">
          {(
            enemies ?? [
              {
                id: "b0",
                name: state.enemyName,
                qi: state.enemyQi,
                maxQi: state.enemyMaxQi,
                down: state.enemyQi <= 0,
              },
            ]
          ).map((foe) => (
            <div
              key={foe.id}
              className={`combat-side foe${foe.down ? " down" : ""}`}
              data-testid={`combat-foe-${foe.id}`}
            >
              <span className="combat-name">
                {foe.name}
                {foe.down ? " · 已伏" : ""}
              </span>
              <Bar value={foe.qi} max={foe.maxQi} tone="qi" />
            </div>
          ))}
        </div>
        <div className="combat-side self">
          <span className="combat-name">你</span>
          <Bar value={state.playerQi} max={state.playerMaxQi} tone="qi" label="气" />
          <Bar value={state.playerJing} max={state.playerMaxJing} tone="jing" label="精" />
          <Bar value={state.playerNeili} max={state.playerMaxNeili} tone="neili" label="内力" />
        </div>
      </div>

      <div className="combat-log" aria-live="polite" data-testid="combat-log" ref={logRef}>
        {state.log.slice(-40).map((line) => (
          <p
            key={line.id}
            className={`combat-line${line.kind === "perform" ? " hl" : ""}${line.kind === "danger" ? " dg" : ""}${flashId === line.id ? " perform-flash" : ""}`}
          >
            {line.text}
          </p>
        ))}
      </div>

      {state.result ? (
        <div className="combat-result-block">
          <p className="combat-result" data-testid="combat-result">
            {RESULT_TEXT[state.result]}
          </p>
          {state.reward && (
            <p className="combat-reward" data-testid="combat-reward">
              所得：阅历 {state.reward.exp} · 潜能 {state.reward.potential} · 银两{" "}
              {state.reward.silver}
            </p>
          )}
          {onDismiss && (
            <button
              type="button"
              className="btn combat-leave"
              data-testid="combat-leave"
              onClick={onDismiss}
            >
              离去
            </button>
          )}
        </div>
      ) : (
        <div className="combat-float-bar" data-testid="combat-actions">
          <p className="combat-auto-hint">交手自行推进 · 择机使招</p>
          <div className="combat-actions">
            {state.performs.map((p) => (
              <Chip
                key={p.id}
                label={p.name}
                variant="perform"
                disabled={busy || !p.ready}
                onClick={() => onAction({ action: "perform", performId: p.id })}
              />
            ))}
            <Chip
              label="回气"
              variant="action"
              disabled={busy}
              onClick={() => onAction({ action: "recover" })}
            />
            <Chip
              label="逃跑"
              variant="danger"
              className="ghost"
              disabled={busy}
              onClick={() => onAction({ action: "flee" })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

const RESULT_TEXT: Record<CombatResult, string> = {
  win: "尘埃落定——你赢了这一场。",
  lose: "力竭而退，来日再战。",
  escape: "全身而退，江湖路长。",
  draw: "未分胜负，各自散去。",
};
export { RESULT_TEXT };
