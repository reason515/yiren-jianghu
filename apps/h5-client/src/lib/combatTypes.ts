/**
 * PVE 战斗传输适配：服务端的 state/events 是唯一事实，客户端只转换为展示状态和受控意图。
 */

export interface CombatLine {
  id: number;
  text: string;
  kind?: "normal" | "perform" | "danger";
}

export interface PerformButton {
  id: string;
  name: string;
  /** 服务端按当前资源、条件与冷却计算；action 时仍由服务端复核。 */
  ready: boolean;
}

export type CombatIntent =
  { action: "attack" | "recover" | "flee" } | { action: "perform"; performId: string };

export type CombatResult = "win" | "lose" | "escape" | "draw";

export interface CombatReward {
  exp: number;
  potential: number;
  silver: number;
  drops: Array<{ itemId: string; count: number }>;
}

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
  reward?: CombatReward;
}

export interface CombatViewProps {
  state: CombatState;
  onAction: (intent: CombatIntent) => void;
}

interface ServerCombatant {
  name: string;
  qi: number;
  maxQi: number;
  jing: number;
  maxJing: number;
  neili: number;
  maxNeili: number;
}

interface ServerCombatEvent {
  seq: number;
  type: string;
  actor?: "a" | "b";
  data: unknown;
}

export interface CombatStatusResponse {
  status: "ongoing" | "finished" | "abandoned";
  state: {
    combatants: { a: ServerCombatant; b: ServerCombatant };
    winner?: "a" | "b" | "draw";
    fled?: "a" | "b";
  };
  events: ServerCombatEvent[];
  performs: PerformButton[];
}

function eventLine(
  event: ServerCombatEvent,
  playerName: string,
  enemyName: string,
): CombatLine | null {
  const actor = event.actor === "a" ? playerName : enemyName;
  const target = event.actor === "a" ? enemyName : playerName;
  switch (event.type) {
    case "battle_start":
      return { id: event.seq, text: `${enemyName}横在眼前，四下的风也静了。` };
    case "damage":
      return { id: event.seq, text: `${actor}招势落定，${target}已然吃痛。` };
    case "parry":
      return { id: event.seq, text: `${target}横开架势，硬将这一击挡下。` };
    case "miss":
    case "dodge":
      return { id: event.seq, text: `${target}侧身避过，招式只掠过衣角。` };
    case "recover":
      return { id: event.seq, text: `${actor}沉息回气，稳住了阵脚。` };
    case "perform":
      return { id: event.seq, text: `${actor}气机一转，绝招已出。`, kind: "perform" };
    case "perform_failed":
      return { id: event.seq, text: `${actor}气息未继，这一式终究未能使全。`, kind: "danger" };
    case "flee":
      return { id: event.seq, text: `${actor}虚晃一步，欲寻退路。`, kind: "danger" };
    case "victory":
      return { id: event.seq, text: "胜负已分，余劲仍在风里。", kind: "perform" };
    case "reward":
      return { id: event.seq, text: "这一程所得，已收入行囊。", kind: "perform" };
    case "quest_progress":
      return { id: event.seq, text: "手头的请托，也向前走了一步。", kind: "perform" };
    case "draw":
      return { id: event.seq, text: "两下分开，谁也没有再追。", kind: "danger" };
    default:
      return null;
  }
}

function rewardOf(events: ServerCombatEvent[]): CombatReward | undefined {
  let event: ServerCombatEvent | undefined;
  for (const candidate of events) {
    if (candidate.type === "reward") event = candidate;
  }
  if (!event || !event.data || typeof event.data !== "object") return undefined;
  const data = event.data as Partial<CombatReward>;
  if (
    typeof data.exp !== "number" ||
    typeof data.potential !== "number" ||
    typeof data.silver !== "number" ||
    !Array.isArray(data.drops)
  ) {
    return undefined;
  }
  return {
    exp: data.exp,
    potential: data.potential,
    silver: data.silver,
    drops: data.drops.filter(
      (drop): drop is { itemId: string; count: number } =>
        typeof drop === "object" &&
        drop !== null &&
        typeof (drop as { itemId?: unknown }).itemId === "string" &&
        typeof (drop as { count?: unknown }).count === "number",
    ),
  };
}

/** 将服务端持久化战斗转换为 CombatView 的展示模型；不推演、不乐观修改。 */
export function toCombatState(response: CombatStatusResponse): CombatState {
  const { a: player, b: enemy } = response.state.combatants;
  const result: CombatResult | undefined =
    response.status !== "finished"
      ? undefined
      : response.state.fled === "a"
        ? "escape"
        : response.state.winner === "a"
          ? "win"
          : response.state.winner === "b"
            ? "lose"
            : "draw";
  return {
    enemyName: enemy.name,
    enemyQi: enemy.qi,
    enemyMaxQi: enemy.maxQi,
    playerQi: player.qi,
    playerMaxQi: player.maxQi,
    playerJing: player.jing,
    playerMaxJing: player.maxJing,
    playerNeili: player.neili,
    playerMaxNeili: player.maxNeili,
    log: response.events
      .map((event) => eventLine(event, player.name, enemy.name))
      .filter((line): line is CombatLine => line !== null),
    performs: response.performs,
    inCombat: response.status === "ongoing",
    ...(result ? { result } : {}),
    ...(result ? { reward: rewardOf(response.events) } : {}),
  };
}
