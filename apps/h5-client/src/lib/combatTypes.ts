/**
 * PVE 战斗传输适配：服务端的 state/events 是唯一事实，客户端只转换为展示状态和受控意图。
 * 支持同场多敌（DC-038）与自动普攻意图（DC-037）。
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
  | { action: "attack" | "recover" | "flee" }
  | { action: "perform"; performId: string; targetId?: string };

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

/** 事件 → 叙事行（PVE 战斗与 PVP 回放共用，避免文案漂移）。 */
export function battleEventLine(
  event: ServerCombatEvent,
  playerName: string,
  enemyName: string,
  names?: (actor: string | undefined) => string,
): CombatLine | null {
  const who = names ?? ((actor) => (actor === "a" || !actor ? playerName : enemyName));
  const data = asRecord(event.data);
  const actorName = who(event.actor);
  const targetId = typeof data.targetId === "string" ? data.targetId : undefined;
  const targetName = targetId ? who(targetId) : event.actor === "a" ? enemyName : playerName;
  const performId = typeof data.performId === "string" ? data.performId : undefined;
  const foeNames = Array.isArray(data.foeNames)
    ? data.foeNames.filter((n): n is string => typeof n === "string")
    : [];
  const foeCount = typeof data.foeCount === "number" ? data.foeCount : foeNames.length;
  const pick = (variants: string[]): string =>
    variants[Math.abs(event.seq) % variants.length] ?? variants[0]!;

  switch (event.type) {
    case "battle_start":
      if (foeCount > 1 || foeNames.length > 1) {
        const list = foeNames.length > 0 ? foeNames.join("、") : "数人";
        return {
          id: event.seq,
          text: pick([
            `四下风停。${list}挡在眼前，这一场注定不是一对一。`,
            `${list}已围上来——你一人，却须应付多方。`,
          ]),
        };
      }
      return {
        id: event.seq,
        text: pick([
          `${enemyName}横在眼前，四下的风也静了。`,
          `与${enemyName}对峙。刀未出鞘，杀机先至。`,
        ]),
      };
    case "damage":
      return {
        id: event.seq,
        text: pick([
          `${actorName}招势落定，${targetName}已然吃痛。`,
          `${actorName}一击得手，${targetName}身形一晃。`,
          `${targetName}被${actorName}迫得退了半步，气息乱了。`,
        ]),
      };
    case "parry":
      return {
        id: event.seq,
        text: pick([
          `${targetName}横开架势，硬将这一击挡下。`,
          `${targetName}架住了，虎口发麻，却未退开。`,
        ]),
      };
    case "miss":
    case "dodge":
      return {
        id: event.seq,
        text: pick([
          `${targetName}侧身避过，招式只掠过衣角。`,
          `${actorName}这一招落空，只带起一阵风。`,
        ]),
      };
    case "recover":
      return {
        id: event.seq,
        text: pick([`${actorName}沉息回气，稳住了阵脚。`, `${actorName}真气归元，肩背松了半分。`]),
      };
    case "perform":
      return {
        id: event.seq,
        text: performId
          ? pick([
              `${actorName}气机一转，使出「${performId}」——${targetName}眼前一花。`,
              `${actorName}使出「${performId}」，${targetName}避无可避。`,
            ])
          : pick([
              `${actorName}气机一转，绝招已出。`,
              `${actorName}这一式来得又急又准，${targetName}措手不及。`,
            ]),
        kind: "perform",
      };
    case "perform_failed":
      return {
        id: event.seq,
        text: `${actorName}气息未继，这一式终究未能使全。`,
        kind: "danger",
      };
    case "flee":
      return {
        id: event.seq,
        text:
          data.success === true
            ? `${actorName}虚晃一步，抽身而去。`
            : `${actorName}欲退，却被对手缠住了脚步。`,
        kind: "danger",
      };
    case "foe_down":
      return {
        id: event.seq,
        text: pick([
          `${typeof data.name === "string" ? data.name : actorName}力竭倒地，一时起不来了。`,
          `尘土扬起——${typeof data.name === "string" ? data.name : actorName}已伏。`,
        ]),
        kind: "perform",
      };
    case "victory":
      return {
        id: event.seq,
        text: pick(["胜负已分，余劲仍在风里。", "尘埃落定。这一场，总算有了了结。"]),
        kind: "perform",
      };
    case "reward":
      return { id: event.seq, text: "这一程所得，已收入行囊。", kind: "perform" };
    case "quest_progress":
      return { id: event.seq, text: "手头的请托，也向前走了一步。", kind: "perform" };
    case "draw":
      return { id: event.seq, text: "两下分开，谁也没有再追。", kind: "danger" };
    case "turn_start":
      return null;
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
    log: response.events
      .map((event) => resolvePerformLabel(event, response.performs))
      .map((event) =>
        battleEventLine(event, player.name, primary?.name ?? "对手", (actor) =>
          nameOf(response, actor, player.name),
        ),
      )
      .filter((line): line is CombatLine => line !== null),
    performs: response.performs,
    inCombat: response.status === "ongoing",
    ...(result ? { result } : {}),
    ...(result ? { reward: rewardOf(response.events) } : {}),
  };
}
