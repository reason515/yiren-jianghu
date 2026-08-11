import { useEffect, useRef, useState, type JSX } from "react";
import { Chip } from "./base/Chip.js";
import { renderCombatSegments } from "./combatRender.js";
import {
  combatLineClassName,
  type CombatResult,
  type CombatViewProps,
} from "../lib/combatTypes.js";
import { replayCombatHud } from "../lib/combatReplay.js";
import { latestPerformLine } from "../lib/effects.js";

/** 战报逐行显现间隔（毫秒）；显现中暂停自动普攻。 */
export const LINE_REVEAL_MS = 1100;
/** 攻防交换 spacer 略长停顿，强化「你打完 → 对方还手」（DC-050）。 */
export const EXCHANGE_REVEAL_MS = 1600;

function revealDelayMs(kind: string | undefined): number {
  return kind === "exchange" ? EXCHANGE_REVEAL_MS : LINE_REVEAL_MS;
}

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
    const nextKind = state.log[visibleCount]?.kind;
    const timer = window.setTimeout(() => {
      setVisibleCount((count) => Math.min(count + 1, logLen));
    }, revealDelayMs(nextKind));
    return () => window.clearTimeout(timer);
  }, [visibleCount, logLen, onPacingChange, state.log]);

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [visibleCount]);

  useEffect(() => () => onPacingChange?.(false), [onPacingChange]);

  if (!state.inCombat && !state.result) return null;

  const hud = replayCombatHud(state, visibleCount);
  const enemies = hud.enemies;
  const foeNames = enemies.map((e) => e.name);
  const visibleLog = state.log.slice(0, visibleCount);
  const revealDone = visibleCount >= logLen;
  /** 服务端已终局，但战报余韵未散时不弹所得。 */
  const showResult = Boolean(state.result) && revealDone;
  const activeSelf = hud.activeActorId === "a";

  return (
    <div className="combat" data-testid="combat" role="region" aria-label="战局">
      <div className="combat-hud" data-testid="combat-hud">
        <div className="combat-foes" data-testid="combat-foes">
          {enemies.map((foe) => {
            const pct =
              foe.maxQi > 0
                ? Math.min(100, Math.max(0, Math.round((foe.qi / foe.maxQi) * 100)))
                : 0;
            const activeFoe = hud.activeActorId === foe.id;
            return (
              <div
                key={foe.id}
                className={`combat-foe${foe.down ? " down" : ""}${activeFoe ? " active" : ""}`}
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
        <div className={`combat-self${activeSelf ? " active" : ""}`} data-testid="combat-self">
          <span className="combat-name self-title">你</span>
          <CombatVital label="气" value={hud.playerQi} max={state.playerMaxQi} tone="qi" />
          <CombatVital label="内" value={hud.playerNeili} max={state.playerMaxNeili} tone="neili" />
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

      {showResult ? (
        <div className="combat-result-block">
          <p className="combat-result" data-testid="combat-result">
            {RESULT_TEXT[state.result!]}
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
      ) : state.result ? (
        <div className="combat-float-bar" data-testid="combat-winding-down">
          <p className="combat-auto-hint">余韵未散……</p>
        </div>
      ) : (
        <div className="combat-float-bar" data-testid="combat-actions">
          <p className="combat-auto-hint">
            {state.busyTurns > 0
              ? `真气未稳（忙乱 ${state.busyTurns}）· 可回气或运功`
              : "交手自行推进 · 择机使招"}
            {state.jiali > 0 ? ` · 加力${state.jiali}` : ""}
          </p>
          <div className="combat-actions">
            {[0, 1, 2, 3].map((level) => (
              <Chip
                key={`jiali-${level}`}
                label={level === 0 ? "加力关" : `加力${level}`}
                variant="action"
                className={state.jiali === level ? undefined : "ghost"}
                disabled={busy}
                onClick={() => onAction({ action: "set_jiali", jiali: level })}
              />
            ))}
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
