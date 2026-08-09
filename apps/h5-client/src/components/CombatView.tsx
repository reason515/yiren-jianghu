import { useEffect, useRef, useState, type JSX } from "react";
import { Chip } from "./base/Chip.js";
import { renderCombatSegments } from "./combatRender.js";
import {
  combatLineClassName,
  type CombatResult,
  type CombatViewProps,
} from "../lib/combatTypes.js";
import { latestPerformLine } from "../lib/effects.js";

/** 战报逐行显现间隔（毫秒）；显现中暂停自动普攻。 */
export const LINE_REVEAL_MS = 1100;

function CombatVital(props: {
  label: string;
  value: number;
  max: number;
  tone: "qi" | "neili";
}): JSX.Element {
  const { label, value, max, tone } = props;
  const pct = max > 0 ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : 0;
  const low = pct < 30;
  return (
    <div className={`combat-vital ${tone}${low ? " low" : ""}`}>
      <span className="combat-vital-label">{label}</span>
      <div
        className="combat-vital-track"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemax={max}
        aria-label={`${label} ${value}/${max}`}
      >
        <div className="combat-vital-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="combat-vital-nums">
        {value}/{max}
      </span>
    </div>
  );
}

/** 自动战视图：看局势 → 抓时机放绝招/回气/逃跑；普攻由上层节拍提交（DC-037/038）。 */
export function CombatView({
  state,
  onAction,
  onDismiss,
  busy = false,
  onPacingChange,
}: CombatViewProps): JSX.Element | null {
  const logRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(() => state.log.length);
  const logLen = state.log.length;
  const logHead = state.log[0]?.id ?? -1;
  const flashId = latestPerformLine(state.log.slice(0, visibleCount))?.id;

  // 战报缩短（新开/重置）时立刻对齐；增长时由下一 effect 逐行放行。
  useEffect(() => {
    setVisibleCount((prev) => (logLen < prev ? logLen : prev));
  }, [logLen, logHead]);

  useEffect(() => {
    if (visibleCount >= logLen) {
      onPacingChange?.(false);
      return;
    }
    onPacingChange?.(true);
    const timer = window.setTimeout(() => {
      setVisibleCount((count) => Math.min(count + 1, logLen));
    }, LINE_REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [visibleCount, logLen, onPacingChange]);

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [visibleCount]);

  useEffect(() => () => onPacingChange?.(false), [onPacingChange]);

  if (!state.inCombat && !state.result) return null;

  const enemies =
    state.enemies.length > 0
      ? state.enemies
      : [
          {
            id: "b0",
            name: state.enemyName,
            qi: state.enemyQi,
            maxQi: state.enemyMaxQi,
            down: state.enemyQi <= 0,
          },
        ];
  const foeNames = enemies.map((e) => e.name);
  const visibleLog = state.log.slice(0, visibleCount);

  return (
    <div className="combat" data-testid="combat" role="region" aria-label="战局">
      <div className="combat-hud" data-testid="combat-hud">
        <div className="combat-foes" data-testid="combat-foes">
          {enemies.map((foe) => {
            const pct =
              foe.maxQi > 0
                ? Math.min(100, Math.max(0, Math.round((foe.qi / foe.maxQi) * 100)))
                : 0;
            return (
              <div
                key={foe.id}
                className={`combat-foe${foe.down ? " down" : ""}`}
                data-testid={`combat-foe-${foe.id}`}
              >
                <span className="combat-name foe-name">
                  {foe.name}
                  {foe.down ? " · 已伏" : ""}
                </span>
                <div className="combat-vital-track foe-track">
                  <div className="combat-vital-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="combat-foe-nums">
                  {foe.qi}/{foe.maxQi}
                </span>
              </div>
            );
          })}
        </div>
        <div className="combat-self" data-testid="combat-self">
          <span className="combat-name self-title">你</span>
          <CombatVital label="气" value={state.playerQi} max={state.playerMaxQi} tone="qi" />
          <CombatVital
            label="内"
            value={state.playerNeili}
            max={state.playerMaxNeili}
            tone="neili"
          />
        </div>
      </div>

      <div className="combat-log" aria-live="polite" data-testid="combat-log" ref={logRef}>
        {visibleLog.map((line) => (
          <p
            key={line.id}
            className={`combat-line${combatLineClassName(line.kind)}${flashId === line.id ? " perform-flash" : ""}`}
          >
            {renderCombatSegments(line, { foeNames })}
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
              所得：
              <span className="rw-exp">阅历 {state.reward.exp}</span>
              <span className="rw-sep"> · </span>
              <span className="rw-pot">潜能 {state.reward.potential}</span>
              <span className="rw-sep"> · </span>
              <span className="rw-silver">银两 {state.reward.silver}</span>
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
  win: "尘埃落定。这一场，你赢了。",
  lose: "力竭而退。来日山河仍在，再战不迟。",
  escape: "抽身而去。江湖路长，不必死磕这一处。",
  draw: "未分胜负。风里只余各自的喘息。",
};
export { RESULT_TEXT };
