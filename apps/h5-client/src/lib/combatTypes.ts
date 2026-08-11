/**
 * PVE 战斗传输适配：服务端的 state/events 是唯一事实，客户端只转换为展示状态和受控意图。
 * 支持同场多敌（DC-038）与自动普攻意图（DC-037）。
 * 战报文案遵循 yjh-wuxia-copywriting；关键字着色见 combatNarrative。
 * HUD 随显现行回放见 combatReplay（DC-050）。
 */

import { narrateBattleEvent, type NarrativeCombatant } from "./combatNarrative.js";
import { hudDeltaFromEvent } from "./combatReplay.js";

/** 句内关键字着色（非整行）。 */
export type CombatMark = "hit" | "hurt" | "dodge" | "parry" | "perform" | "tense" | "recover";

export interface CombatSegment {
  text: string;
  mark?: CombatMark;
}

/** 单行对 HUD 的气血/内力增量（显现时生效；终态由服务端权威）。 */
export interface CombatHudDelta {
  qiById?: Record<string, number>;
  neiliById?: Record<string, number>;
}

export interface CombatLine {
  id: number;
  text: string;
  segments?: CombatSegment[];
  kind?: CombatLineKind;
  /** 事件行动方（攻防高亮）；交换 spacer 无 */
  actorId?: string;
  /** 本行对应的 HUD 增量，供逐行回放 */
  hud?: CombatHudDelta;
}

/** 行级语义：仅开战/胜负等氛围行保留轻量整行气质；击中/闪避改走 segments。 */
export type CombatLineKind =
  | "normal"
  | "start"
  | "damage"
  | "hurt"
  | "dodge"
  | "parry"
  | "perform"
  | "recover"
  | "danger"
  | "down"
  | "victory"
  | "spacer"
  /** 玩家动作块与敌方还手之间的攻防交换停顿（DC-050） */
  | "exchange";

/** 整行 class 仅保留开场/收束气质；命中类颜色改走 `.cm-*` 关键字。 */
export function combatLineClassName(kind?: CombatLineKind): string {
  switch (kind) {
    case "start":
      return " start";
    case "victory":
      return " victory";
    case "down":
      return " down-line";
    case "spacer":
      return " spacer";
    case "exchange":
      return " exchange";
    default:
      return "";
  }
}

export interface PerformButton {
  id: string;
  name: string;
  /** 服务端按当前资源、条件与冷却计算；action 时仍由服务端复核。 */
  ready: boolean;
}

export type CombatIntent =
  | { action: "attack" | "recover" | "flee" }
  | { action: "perform"; performId: string; targetId?: string }
  | { action: "set_jiali"; jiali: number };

export type CombatResult = "win" | "lose" | "escape" | "draw";

export interface CombatReward {
  exp: number;
  potential: number;
  silver: number;
  drops: Array<{ itemId: string; count: number }>;
}

export interface CombatEnemyView {
  id: string;
  name: string;
  qi: number;
  maxQi: number;
  down: boolean;
}

export interface CombatState {
  /** @deprecated 单敌兼容；请用 enemies */
  enemyName: string;
  enemyQi: number;
  enemyMaxQi: number;
  enemies: CombatEnemyView[];
  playerQi: number;
  playerMaxQi: number;
  playerJing: number;
  playerMaxJing: number;
  playerNeili: number;
  playerMaxNeili: number;
  /** 当前加力档位 0–3（DC-048）。 */
  jiali: number;
  /** 忙乱剩余回合（DC-049）；>0 时禁普攻。 */
  busyTurns: number;
  log: CombatLine[];
  performs: PerformButton[];
  inCombat: boolean;
  result?: CombatResult;
  reward?: CombatReward;
}

export interface CombatViewProps {
  state: CombatState;
  onAction: (intent: CombatIntent) => void;
  /** 结果横幅上的离去 */
  onDismiss?: () => void;
  /** 请求进行中时禁用动作，避免叠拍 */
  busy?: boolean;
  /** 战报逐行显现中为 true，供上层暂停自动普攻 */
  onPacingChange?: (pacing: boolean) => void;
}

interface ServerCombatant {
  id?: string;
  name: string;
  qi: number;
  maxQi: number;
  jing: number;
  maxJing: number;
  neili: number;
  maxNeili: number;
  jiali?: number;
  busyTurns?: number;
  nature?: "human" | "beast" | "bird";
  stats?: NarrativeCombatant["stats"];
}

interface ServerCombatEvent {
  seq: number;
  type: string;
  actor?: string;
  data: unknown;
}

export interface CombatStatusResponse {
  status: "ongoing" | "finished" | "abandoned";
  targetId?: string;
  targetIds?: string[];
  state: {
    combatants: Record<string, ServerCombatant>;
    foeIds?: string[];
    foeNpcIds?: Record<string, string>;
    winner?: "a" | "b" | "draw";
    fled?: string;
  };
  events: ServerCombatEvent[];
  performs: PerformButton[];
}

function asRecord(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

function foeSlotsOf(response: CombatStatusResponse): string[] {
  const { state } = response;
  if (state.foeIds && state.foeIds.length > 0) return state.foeIds;
  if (state.combatants.b) return ["b"];
  return Object.keys(state.combatants)
    .filter((key) => key !== "a")
    .sort();
}

function nameOf(
  response: CombatStatusResponse,
  actor: string | undefined,
  playerName: string,
): string {
  if (!actor || actor === "a") return playerName;
  return response.state.combatants[actor]?.name ?? "对手";
}

function narrativeOf(
  response: CombatStatusResponse,
  actor: string | undefined,
  playerName: string,
): NarrativeCombatant | undefined {
  if (!actor) return undefined;
  if (actor === "a") {
    const player = response.state.combatants.a;
    if (!player) return { name: playerName, nature: "human" };
    return {
      name: playerName,
      nature: player.nature ?? "human",
      stats: player.stats,
      maxQi: player.maxQi,
    };
  }
  const foe = response.state.combatants[actor];
  if (!foe) return undefined;
  return {
    name: foe.name,
    nature: foe.nature,
    stats: foe.stats,
    maxQi: foe.maxQi,
  };
}

/** 事件 → 叙事行（PVE 战斗与 PVP 回放共用，避免文案漂移）。 */
export function battleEventLine(
  event: ServerCombatEvent,
  playerName: string,
  enemyName: string,
  names?: (actor: string | undefined) => string,
  combatantOf?: (actor: string | undefined) => NarrativeCombatant | undefined,
): CombatLine | null {
  return narrateBattleEvent(event, playerName, enemyName, {
    names,
    combatantOf,
  });
}

const EXCHANGE_EVENT_TYPES = new Set([
  "damage",
  "dodge",
  "parry",
  "perform",
  "recover",
  "flee",
  "busy",
  "attack_failed",
  "perform_failed",
]);

function isPlayerActor(actor: string | undefined): boolean {
  return !actor || actor === "a";
}

/** 回合交界 spacer + 玩家/敌方动作块之间的 exchange 停顿（DC-050）。 */
export function eventsToCombatLines(
  events: ServerCombatEvent[],
  playerName: string,
  enemyName: string,
  names?: (actor: string | undefined) => string,
  combatantOf?: (actor: string | undefined) => NarrativeCombatant | undefined,
  performs: PerformButton[] = [],
): CombatLine[] {
  const lines: CombatLine[] = [];
  let turnSeen = false;
  let playerBlockDone = false;
  let exchangeSpacerDone = false;
  for (const raw of events) {
    const event = resolvePerformLabel(raw, performs);
    if (event.type === "turn_start") {
      if (turnSeen) {
        lines.push({ id: -Math.abs(event.seq || 1), text: "", kind: "spacer", segments: [] });
      }
      turnSeen = true;
      playerBlockDone = false;
      exchangeSpacerDone = false;
    }
    if (EXCHANGE_EVENT_TYPES.has(event.type) && !isPlayerActor(event.actor)) {
      if (playerBlockDone && !exchangeSpacerDone) {
        lines.push({
          id: -(100_000 + Math.abs(event.seq || 1)),
          text: "",
          kind: "exchange",
          segments: [],
        });
        exchangeSpacerDone = true;
      }
    }
    const line = battleEventLine(event, playerName, enemyName, names, combatantOf);
    if (line) {
      if (event.actor) line.actorId = event.actor;
      const hud = hudDeltaFromEvent(event);
      if (hud) line.hud = hud;
      lines.push(line);
      if (EXCHANGE_EVENT_TYPES.has(event.type) && isPlayerActor(event.actor)) {
        playerBlockDone = true;
      }
    }
  }
  return lines;
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

function resolvePerformLabel(
  event: ServerCombatEvent,
  performs: PerformButton[],
): ServerCombatEvent {
  if (event.type !== "perform") return event;
  const data = asRecord(event.data);
  const performId = typeof data.performId === "string" ? data.performId : undefined;
  if (!performId) return event;
  const named = performs.find((p) => p.id === performId);
  if (!named) return event;
  return {
    ...event,
    data: { ...data, performId: named.name },
  };
}

/** 将服务端持久化战斗转换为 CombatView 的展示模型；不推演、不乐观修改。 */
export function toCombatState(response: CombatStatusResponse): CombatState {
  const player = response.state.combatants.a;
  if (!player) {
    return {
      enemyName: "对手",
      enemyQi: 0,
      enemyMaxQi: 1,
      enemies: [],
      playerQi: 0,
      playerMaxQi: 1,
      playerJing: 0,
      playerMaxJing: 1,
      playerNeili: 0,
      playerMaxNeili: 1,
      jiali: 0,
      busyTurns: 0,
      log: [],
      performs: response.performs,
      inCombat: false,
    };
  }
  const slots = foeSlotsOf(response);
  const enemies: CombatEnemyView[] = slots.map((slot) => {
    const foe = response.state.combatants[slot]!;
    return {
      id: slot,
      name: foe.name,
      qi: foe.qi,
      maxQi: foe.maxQi,
      down: foe.qi <= 0,
    };
  });
  const primary = enemies[0];
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
  const enemyName =
    enemies.length > 1 ? enemies.map((e) => e.name).join("、") : (primary?.name ?? "对手");
  const primarySlot = slots[0];
  return {
    enemyName,
    enemyQi: primary?.qi ?? 0,
    enemyMaxQi: primary?.maxQi ?? 1,
    enemies,
    playerQi: player.qi,
    playerMaxQi: player.maxQi,
    playerJing: player.jing,
    playerMaxJing: player.maxJing,
    playerNeili: player.neili,
    playerMaxNeili: player.maxNeili,
    jiali: player.jiali ?? 0,
    busyTurns: player.busyTurns ?? 0,
    log: eventsToCombatLines(
      response.events,
      player.name,
      primary?.name ?? "对手",
      (actor) => nameOf(response, actor, player.name),
      (actor) => {
        if (!actor) return undefined;
        if ((actor === "b" || actor === "b0") && primarySlot) {
          return narrativeOf(response, primarySlot, player.name);
        }
        return narrativeOf(response, actor, player.name);
      },
      response.performs,
    ),
    performs: response.performs,
    inCombat: response.status === "ongoing",
    ...(result ? { result } : {}),
    ...(result ? { reward: rewardOf(response.events) } : {}),
  };
}
