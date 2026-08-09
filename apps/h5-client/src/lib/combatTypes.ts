/**
 * PVE 战斗传输适配：服务端的 state/events 是唯一事实，客户端只转换为展示状态和受控意图。
 * 支持同场多敌（DC-038）与自动普攻意图（DC-037）。
 * 战报文案遵循 yjh-wuxia-copywriting（金庸画面 / 古龙节奏 / 黄易气机）。
 */

export interface CombatLine {
  id: number;
  text: string;
  kind?: CombatLineKind;
}

/** 语义着色：颜色只区分「类」（击中/受伤/绝招/回避…），不裸露数值。 */
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
  | "victory";

export function combatLineClassName(kind?: CombatLineKind): string {
  switch (kind) {
    case "start":
      return " start";
    case "damage":
      return " hit";
    case "hurt":
      return " hurt";
    case "dodge":
      return " dodge";
    case "parry":
      return " parry";
    case "perform":
      return " hl";
    case "recover":
      return " recover";
    case "danger":
      return " dg";
    case "down":
      return " down-line";
    case "victory":
      return " victory";
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

/** 玩家侧用第二人称「你」，更像在读武侠小说。 */

/** 事件 → 叙事行（PVE 战斗与 PVP 回放共用，避免文案漂移）。 */
export function battleEventLine(
  event: ServerCombatEvent,
  playerName: string,
  enemyName: string,
  names?: (actor: string | undefined) => string,
): CombatLine | null {
  const resolve = names ?? ((actor) => (actor === "a" || !actor ? playerName : enemyName));
  const data = asRecord(event.data);
  const fromPlayer = !event.actor || event.actor === "a";
  const actorName = fromPlayer ? "你" : resolve(event.actor);
  const targetId = typeof data.targetId === "string" ? data.targetId : undefined;
  const hitTarget =
    targetId === "a" ? "你" : targetId ? resolve(targetId) : fromPlayer ? enemyName : "你";
  const performName = typeof data.performId === "string" ? data.performId : undefined;
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
          kind: "start",
          text: pick([
            `风忽然静了。${list}已将退路堵死——这一场，注定要一个人应付多方。`,
            `${list}围上来。杀意像潮水，一寸寸漫过脚面。`,
          ]),
        };
      }
      return {
        id: event.seq,
        kind: "start",
        text: pick([
          `${enemyName}横在眼前。四下无声，只余彼此的呼吸。`,
          `与${enemyName}对上了。刀未出鞘，杀机先至。`,
        ]),
      };
    case "damage":
      return {
        id: event.seq,
        kind: fromPlayer ? "damage" : "hurt",
        text: fromPlayer
          ? pick([
              `力由脊发。你这一击落在${hitTarget}身上——他闷哼一声，脚步乱了。`,
              `没有花哨。你只递出一记干脆的着子，${hitTarget}肩头已吃了实打。`,
              `招势过处，衣角翻飞。${hitTarget}胸前一沉，气息散了半寸。`,
            ])
          : pick([
              `${actorName}扑近，爪牙已至。你肋下一疼，真气乱了片刻。`,
              `${actorName}这一下又狠又快——你退得半步，口中却已泛起铁锈味。`,
              `避无可避。${actorName}的力道撞上肩背，你牙关一紧。`,
            ]),
      };
    case "parry":
      return {
        id: event.seq,
        kind: "parry",
        text: pick([
          `${hitTarget}横开架势，硬生生把这一击挡下。虎口发麻，人却没退。`,
          `金石相交，一串短响。${hitTarget}架住了，腕骨隐隐发酸。`,
        ]),
      };
    case "miss":
    case "dodge":
      return {
        id: event.seq,
        kind: "dodge",
        text: pick([
          `${hitTarget}侧身半寸。招式擦过衣角，只带起一阵空风。`,
          `差一点。${actorName}这一招落空，尘土在脚边打了个旋。`,
          `没有人看清那一瞬——${hitTarget}已让开，招式扑了个空。`,
        ]),
      };
    case "recover":
      return {
        id: event.seq,
        kind: "recover",
        text: pick([
          `${actorName}沉息归元。浊气下沉，清气上升，肩背松了半分。`,
          `丹田一点暖意散开。${actorName}稳住了阵脚，呼吸渐沉。`,
        ]),
      };
    case "perform":
      return {
        id: event.seq,
        kind: "perform",
        text: performName
          ? pick([
              `气机一转。你使出「${performName}」——${hitTarget}眼前一花，竟来不及完整看清那一式。`,
              `「${performName}」！你起手便是杀机。等风声落定，${hitTarget}才觉出身上已中了一记。`,
              `你指尖微颤，真气随招走。「${performName}」递出，${hitTarget}退无可退。`,
            ])
          : pick([
              `气机一转，绝招已出。短促，凌厉，不留余地。`,
              `这一式来得又急又准——对手心神最松的一瞬，你已递到了。`,
            ]),
      };
    case "perform_failed":
      return {
        id: event.seq,
        kind: "danger",
        text: pick([
          `${actorName}气息未继，这一式终究散在半途。`,
          `真气一滞。${actorName}想发的那一招，只余半截余势。`,
        ]),
      };
    case "flee":
      return {
        id: event.seq,
        kind: "danger",
        text:
          data.success === true
            ? pick([
                `${actorName}虚晃一步，身形已没入烟尘。`,
                `退路虽窄，${actorName}还是从杀机缝里钻了出去。`,
              ])
            : pick([
                `${actorName}想退，对手却缠上来，退路被堵死了。`,
                `抽身不及。${actorName}刚挪半步，便被杀气压了回去。`,
              ]),
      };
    case "foe_down": {
      const fallen = typeof data.name === "string" ? data.name : actorName;
      return {
        id: event.seq,
        kind: "down",
        text: pick([
          `${fallen}膝下一软，栽进尘土——一时起不来了。`,
          `风过处，${fallen}已伏。余劲还在，人却静了。`,
        ]),
      };
    }
    case "victory":
      return {
        id: event.seq,
        kind: "victory",
        text: pick([
          `胜负已分。余劲散在风里，像一场未写完的句号。`,
          `尘埃落定。四下忽然静得能听见自己的心跳。`,
        ]),
      };
    case "reward":
      return {
        id: event.seq,
        kind: "victory",
        text: pick(["这一程所得，已收入行囊。", "战利入囊。江湖路远，先带走眼前这点。"]),
      };
    case "quest_progress":
      return {
        id: event.seq,
        kind: "normal",
        text: pick(["手头的请托，也向前走了一步。", "这一战之后，肩上的差事轻了半分。"]),
      };
    case "draw":
      return {
        id: event.seq,
        kind: "danger",
        text: pick(["两下分开，谁也没有再追。", "未分胜负。风里只余各自的喘息。"]),
      };
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
