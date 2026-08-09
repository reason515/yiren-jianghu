import type { JSX } from "react";
import { Sheet } from "./base/Sheet.js";
import { renderCombatSegments } from "./combatRender.js";
import { battleEventLine, combatLineClassName } from "../lib/combatTypes.js";
import type { PvpMatchDetail } from "../lib/pvpTypes.js";
import { pvpResultView } from "../lib/pvpTypes.js";

/**
 * 论剑战报回放：服务端事件流是唯一事实来源（actor a=我方，b=对手）。
 * 叙事行与 PVE 战斗共用同一渲染器；积分变动只展示服务端结算值。
 */
export interface PvpReplayViewProps {
  open: boolean;
  match: PvpMatchDetail | null;
  onClose: () => void;
}

export function PvpReplayView({ open, match, onClose }: PvpReplayViewProps): JSX.Element | null {
  return (
    <Sheet open={open} title="论剑回响" onClose={onClose}>
      {match ? (
        <div className="pvp-replay" data-testid="pvp-replay">
          <p className="pvp-replay-head">
            <span className="pvp-replay-names">
              {match.challengerName} 对 {match.defenderName}
            </span>
            <span className="pvp-replay-delta">
              积分 {match.scoreDelta > 0 ? "+" : ""}
              {match.scoreDelta}
            </span>
          </p>
          <p
            className={`pvp-replay-result${pvpResultView(match.result).won ? " won" : ""}`}
            data-testid="pvp-replay-result"
          >
            {pvpResultView(match.result).text}
          </p>
          <div className="combat-log" aria-live="polite">
            {match.events.length === 0 ? (
              <p className="pvp-replay-empty">此战已归档，招式的余韵早已散尽。</p>
            ) : (
              match.events.map((event) => {
                const line = battleEventLine(event, match.challengerName, match.defenderName);
                if (!line) return null;
                return (
                  <p key={line.id} className={`combat-line${combatLineClassName(line.kind)}`}>
                    {renderCombatSegments(line, { foeNames: [match.defenderName] })}
                  </p>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <p className="pvp-empty">回响已散，无从追忆。</p>
      )}
    </Sheet>
  );
}
