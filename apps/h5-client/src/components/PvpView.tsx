import type { JSX } from "react";
import { Sheet } from "./base/Sheet.js";
import { Chip } from "./base/Chip.js";
import type { PvpOpponent, PvpSeason } from "../lib/pvpTypes.js";
import { seasonRemainLabel } from "../lib/pvpTypes.js";

/**
 * 论剑面板：赛季信息 + 可邀战对手。发起对战为高风险操作，由上层二次确认；
 * 客户端只提交 defenderId 意图，胜负、积分与战报全部由服务端结算。
 */
export interface PvpViewProps {
  open: boolean;
  season: PvpSeason | null;
  opponents: PvpOpponent[];
  pending: boolean;
  onChallenge: (opponent: PvpOpponent) => void;
  onClose: () => void;
}

export function PvpView({
  open,
  season,
  opponents,
  pending,
  onChallenge,
  onClose,
}: PvpViewProps): JSX.Element | null {
  return (
    <Sheet open={open} title="论剑" onClose={onClose}>
      {season && (
        <p className="pvp-season" data-testid="pvp-season">
          {season.name}
          {season.status === "active" ? seasonRemainLabel(season.endsAt) : " · 赛季已收"}
        </p>
      )}

      <p className="pvp-lead">江湖不比口舌，只比快慢。择一位对手邀战，胜负自有剑下分明。</p>

      {opponents.length === 0 ? (
        <p className="pvp-empty">名册上空无一人——待有他人踏入江湖，再行邀战。</p>
      ) : (
        <ul className="pvp-list" data-testid="pvp-list">
          {opponents.map((opponent) => (
            <li key={opponent.characterId} className="pvp-row">
              <div className="pvp-info">
                <span className="pvp-name">{opponent.name}</span>
                <span className="pvp-exp">阅历 {opponent.exp}</span>
              </div>
              <Chip
                label="邀战"
                variant="action"
                disabled={pending}
                onClick={() => onChallenge(opponent)}
              />
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
