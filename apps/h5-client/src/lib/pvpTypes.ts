/** PVP 论剑数据：服务端快照与战报是唯一事实来源；客户端只发起邀战意图并渲染回放。 */

export interface PvpSeason {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  status: "active" | "ended" | "upcoming";
}

export interface PvpOpponent {
  characterId: string;
  name: string;
  exp: number;
}

export type PvpResult = "challenger_win" | "defender_win" | "draw";

export interface PvpMatchResult {
  id: string;
  result: PvpResult;
  winner: string;
  turns: number;
  seed: number;
  scoreDelta: number;
  challengerName: string;
  defenderName: string;
}

/** 战报事件与 PVE 战斗事件同构（actor a=我方/挑战者，b=对手/应战者）。 */
export interface PvpReplayEvent {
  seq: number;
  type: string;
  actor?: "a" | "b";
  data: unknown;
}

export interface PvpMatchDetail extends PvpMatchResult {
  createdAt: string;
  events: PvpReplayEvent[];
}

/** 结果横幅（胜负/平局 + 我方视角）。 */
export function pvpResultView(result: PvpResult): { text: string; won: boolean } {
  switch (result) {
    case "challenger_win":
      return { text: "这一场，你胜了。", won: true };
    case "defender_win":
      return { text: "这一场，你败了。", won: false };
    default:
      return { text: "两下未分胜负。", won: false };
  }
}

/** 赛季剩余：面向玩家的可读提示（不泄漏内部时间戳）。 */
export function seasonRemainLabel(endsAt: string): string {
  const days = Math.max(0, Math.ceil((Date.parse(endsAt) - Date.now()) / 86_400_000));
  return days > 0 ? ` · 余 ${days} 日` : " · 今日收官";
}
