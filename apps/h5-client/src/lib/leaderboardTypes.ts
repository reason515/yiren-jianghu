/** 排行榜数据（服务端快照；长期成长榜 + 赛季竞技榜）。 */

export type LeaderboardKind = "growth" | "season_pvp";

export interface LeaderboardEntry {
  rank: number;
  characterId: string;
  name: string;
  /** 成长榜=历练；赛季榜=积分。 */
  value: number;
  isMe: boolean;
}

export interface SeasonInfo {
  id: string;
  name: string;
  status: "active" | "ended";
  endsAt?: string;
}

export interface LeaderboardData {
  kind: LeaderboardKind;
  season?: SeasonInfo;
  entries: LeaderboardEntry[];
}
