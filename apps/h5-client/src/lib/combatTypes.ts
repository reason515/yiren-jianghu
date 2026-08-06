/** 战斗状态（由服务端结算推送；客户端只渲染与发动作意图）。 */

export interface CombatLine {
  id: number;
  text: string;
  kind?: "normal" | "perform" | "danger";
}

export interface PerformButton {
  id: string;
  name: string;
  /** 服务端判定的可用性（冷却/消耗/条件）。 */
  ready: boolean;
}

export type CombatResult = "win" | "lose" | "escape" | "draw";

export interface CombatState {
  enemyName: string;
  enemyQi: number;
  enemyMaxQi: number;
  playerQi: number;
  playerMaxQi: number;
  playerJing: number;
  playerMaxJing: number;
  playerNeili: number;
  playerMaxNeili: number;
  log: CombatLine[];
  performs: PerformButton[];
  inCombat: boolean;
  result?: CombatResult;
}

export interface CombatViewProps {
  state: CombatState;
  onAction: (command: string) => void;
}
