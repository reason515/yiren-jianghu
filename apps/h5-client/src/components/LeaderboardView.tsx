import { useState, type JSX } from "react";
import { Sheet } from "./base/Sheet.js";
import { ChoiceRow } from "./base/ChoiceRow.js";
import type { LeaderboardData, LeaderboardKind } from "../lib/leaderboardTypes.js";

/** 排行榜（双轨 seg；数值带语义标签，我的行玉色高亮）。 */
export interface LeaderboardViewProps {
  open: boolean;
  growth: LeaderboardData;
  season: LeaderboardData;
  onClose: () => void;
}

export function LeaderboardView({
  open,
  growth,
  season,
  onClose,
}: LeaderboardViewProps): JSX.Element | null {
  const [kind, setKind] = useState<LeaderboardKind>("growth");
  const data = kind === "growth" ? growth : season;

  return (
    <Sheet open={open} title="天下名册" onClose={onClose}>
      <ChoiceRow
        label="榜单"
        options={[
          { value: "growth", label: "成长榜" },
          { value: "season_pvp", label: "论剑榜" },
        ]}
        value={kind}
        onChange={setKind}
      />

      {data.season && (
        <p className="lb-season" data-testid="lb-season">
          {data.season.name} · {data.season.status === "active" ? "赛季进行中" : "已结算"}
          {data.season.endsAt ? ` · 至 ${data.season.endsAt}` : ""}
        </p>
      )}

      {data.entries.length === 0 ? (
        <p className="lb-empty">榜上尚无留名。</p>
      ) : (
        <ol className="lb-list" data-testid="lb-list" data-kind={kind}>
          {data.entries.map((e) => (
            <li key={e.characterId} className={`lb-row${e.isMe ? " me" : ""}`}>
              <span className="lb-rank">{e.rank}</span>
              <span className="lb-name">
                {e.name}
                {e.isMe && <span className="lb-me">（我）</span>}
              </span>
              <span className="lb-value">
                {kind === "growth" ? "历练" : "积分"} {e.value}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Sheet>
  );
}
