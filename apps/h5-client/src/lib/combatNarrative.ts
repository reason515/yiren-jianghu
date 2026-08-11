/**
 * 战斗叙事（借鉴 xkx 击间闲笔 / 人兽分流 / 分级伤势神韵，文案原创）。
 * 契约：damage/dodge/parry 均为「攻方起手 → 守方结果」一句闭环；着色只落关键字。
 */

import type { CombatLine, CombatLineKind, CombatMark, CombatSegment } from "./combatTypes.js";

export type CombatNature = "human" | "beast" | "bird";
/** beast 内细分词库（不扩 schema nature 枚举）。 */
export type BeastKind = "canine" | "serpentine" | "generic";
export type CombatTier = "low" | "mid" | "high";
export type DamageBand = "light" | "mid" | "heavy";

export interface NarrativeStats {
  attack: number;
  defense: number;
  dodge: number;
  parry: number;
  weaponLevel: number;
  forceLevel: number;
}

export interface NarrativeCombatant {
  name: string;
  nature?: CombatNature;
  stats?: NarrativeStats;
  maxQi?: number;
}

export interface BattleLineOptions {
  names?: (actor: string | undefined) => string;
  combatantOf?: (actor: string | undefined) => NarrativeCombatant | undefined;
}

type Part = string | { t: string; m: CombatMark };

interface ServerCombatEvent {
  seq: number;
  type: string;
  actor?: string;
  data: unknown;
}

/** 同战短记忆：避免连续同 kind 抽到同一模板下标。battle_start 时清空。 */
const recentPickByPool = new Map<string, number[]>();
const RECENT_WINDOW = 4;

function asRecord(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

function hashSeed(...parts: Array<string | number | undefined>): number {
  let h = 2166136261;
  for (const part of parts) {
    const s = String(part ?? "");
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return Math.abs(h | 0);
}

/** 稳定哈希 + 会话短记忆去重。 */
export function pickVariant<T>(
  poolKey: string,
  variants: T[],
  seed: number,
  clearRecent = false,
): T {
  if (clearRecent) recentPickByPool.clear();
  if (variants.length === 0) {
    throw new Error(`empty template pool: ${poolKey}`);
  }
  if (variants.length === 1) return variants[0]!;
  const recent = recentPickByPool.get(poolKey) ?? [];
  let idx = seed % variants.length;
  for (let attempt = 0; attempt < variants.length; attempt += 1) {
    const candidate = (idx + attempt) % variants.length;
    if (!recent.includes(candidate)) {
      idx = candidate;
      break;
    }
  }
  const next = [...recent, idx].slice(-RECENT_WINDOW);
  recentPickByPool.set(poolKey, next);
  return variants[idx]!;
}

function pick<T>(poolKey: string, variants: T[], event: ServerCombatEvent, extra: string = ""): T {
  const data = asRecord(event.data);
  const targetId = typeof data.targetId === "string" ? data.targetId : "";
  const seed = hashSeed(event.seq, event.type, event.actor, targetId, extra, poolKey);
  return pickVariant(poolKey, variants, seed, event.type === "battle_start");
}

export function inferNature(name: string, id?: string): CombatNature {
  const s = `${id ?? ""}${name}`;
  if (/鸟|鹰|雕|雀|鸦|鹤|雁/.test(s)) return "bird";
  if (/狗|犬|狼|鼠|虎|豹|熊|蛇|蟒|兽|猫|狐|猪|牛|马/.test(s)) return "beast";
  return "human";
}

export function inferBeastKind(name: string, id?: string): BeastKind {
  const s = `${id ?? ""}${name}`;
  if (/蛇|蟒/.test(s)) return "serpentine";
  if (/狗|犬|狼|狐/.test(s)) return "canine";
  return "generic";
}

export function combatTier(stats?: NarrativeStats): CombatTier {
  if (!stats) return "low";
  const score = stats.attack + stats.forceLevel + stats.weaponLevel;
  if (score >= 45) return "high";
  if (score >= 20) return "mid";
  return "low";
}

export function damageBand(damage: number, maxQi?: number): DamageBand {
  if (maxQi && maxQi > 0) {
    const ratio = damage / maxQi;
    if (ratio < 0.1) return "light";
    if (ratio < 0.25) return "mid";
    return "heavy";
  }
  if (damage < 6) return "light";
  if (damage < 14) return "mid";
  return "heavy";
}

function assemble(id: number, kind: CombatLineKind | undefined, parts: Part[]): CombatLine {
  const segments: CombatSegment[] = parts.map((part) =>
    typeof part === "string" ? { text: part } : { text: part.t, mark: part.m },
  );
  return {
    id,
    kind,
    text: segments.map((s) => s.text).join(""),
    segments,
  };
}

function kw(text: string, mark: CombatMark): Part {
  return { t: text, m: mark };
}

function natureOf(
  actor: string | undefined,
  name: string,
  options?: BattleLineOptions,
): CombatNature {
  const c = options?.combatantOf?.(actor);
  if (c?.nature) return c.nature;
  return inferNature(c?.name ?? name, actor);
}

function nameForKind(
  actor: string | undefined,
  fallbackName: string,
  options?: BattleLineOptions,
): string {
  return options?.combatantOf?.(actor)?.name ?? fallbackName;
}

function beastKindOf(
  actor: string | undefined,
  name: string,
  options?: BattleLineOptions,
): BeastKind {
  const c = options?.combatantOf?.(actor);
  return inferBeastKind(c?.name ?? name, actor);
}

function tierOf(actor: string | undefined, options?: BattleLineOptions): CombatTier {
  return combatTier(options?.combatantOf?.(actor)?.stats);
}

function maxQiOf(actor: string | undefined, options?: BattleLineOptions): number | undefined {
  return options?.combatantOf?.(actor)?.maxQi;
}

/** 击间闲笔：禁与 dodge 共用「侧身半寸」起句。 */
function atmosphereLine(
  event: ServerCombatEvent,
  actorLabel: string,
  foeLabel: string,
  actorNature: CombatNature,
  actorTier: CombatTier,
): CombatLine {
  if (actorNature === "beast") {
    const kind = inferBeastKind(actorLabel);
    if (kind === "serpentine") {
      return assemble(
        event.seq,
        "normal",
        pick(
          "atm-serpent",
          [
            [actorLabel, "信子一吐一收，鳞光微动，死死", kw("盯着", "tense"), foeLabel, "。"],
            [actorLabel, "绕着", foeLabel, "缓缓盘了半圈，身子压得更低。"],
            [actorLabel, "寒意贴地而来，却迟迟不攻——只在", kw("窥伺", "tense"), "。"],
            [actorLabel, "尾尖轻扫尘土，目光钉在", foeLabel, "脚踝。"],
            [actorLabel, "喉间无声，鳞片一紧一松，杀机未散。"],
          ],
          event,
        ),
      );
    }
    return assemble(
      event.seq,
      "normal",
      pick(
        "atm-beast",
        [
          [actorLabel, "伏低身躯，喉咙里滚着低吼，眼睛死死", kw("盯着", "tense"), foeLabel, "。"],
          [actorLabel, "绕着", foeLabel, "转了半圈，爪子刨土，随时可能再扑。"],
          [actorLabel, "呲着牙退了半步，却丝毫没有放松", kw("盯视", "tense"), "。"],
          [actorLabel, "鼻翼翕动，嗅着血腥气，步子越压越低。"],
          [actorLabel, "前爪点地，肩背弓起，像一张拉满的弓。"],
        ],
        event,
      ),
    );
  }
  if (actorNature === "bird") {
    return assemble(
      event.seq,
      "normal",
      pick(
        "atm-bird",
        [
          [actorLabel, "振翅掠过半空，锐眼", kw("盯着", "tense"), foeLabel, "的头顶。"],
          [actorLabel, "尖鸣一声，在空中盘旋，寻找下扑的时机。"],
          [actorLabel, "翅影一晃，又升了半丈，始终不离", foeLabel, "周遭。"],
          [actorLabel, "羽毛逆风而张，目光像两枚钉子钉在", foeLabel, "肩上。"],
          [actorLabel, "忽然收翅悬停一瞬，又疾旋开去——伺机。"],
        ],
        event,
      ),
    );
  }
  if (actorTier === "high") {
    return assemble(
      event.seq,
      "normal",
      pick(
        "atm-human-high",
        [
          [actorLabel, "气机牵引之间，已看清", foeLabel, "肩头那一瞬的", kw("破绽", "tense"), "。"],
          [actorLabel, "缓步半寸，像把整片杀机都压进脚底——伺机而动。"],
          [actorLabel, "目不转睛", kw("盯着", "tense"), foeLabel, "，呼吸却稳得像没在打。"],
          [actorLabel, "袖口不动，杀意却先落到", foeLabel, "喉前三分。"],
          [actorLabel, "脚尖轻碾碎石，已把", foeLabel, "的退路量过一遍。"],
        ],
        event,
      ),
    );
  }
  if (actorTier === "mid") {
    return assemble(
      event.seq,
      "normal",
      pick(
        "atm-human-mid",
        [
          [actorLabel, "慢慢移动脚步，想找出", foeLabel, "的", kw("破绽", "tense"), "。"],
          [actorLabel, "正", kw("盯着", "tense"), foeLabel, "一举一动，随时准备递招。"],
          [actorLabel, "鞋底碾过碎石，杀机未散，目光不离", foeLabel, "。"],
          [actorLabel, "沉肩调息，把下一记的力道先蓄在腰眼。"],
          [actorLabel, "绕开半步，试探", foeLabel, "是否还会欺近。"],
        ],
        event,
      ),
    );
  }
  return assemble(
    event.seq,
    "normal",
    pick(
      "atm-human-low",
      [
        [actorLabel, "咽了口唾沫，脚步乱挪，却还死死", kw("盯着", "tense"), foeLabel, "。"],
        [actorLabel, "喘着粗气，抬手护住前胸，不敢移开视线。"],
        [actorLabel, "左右挪了两步，像在找一个敢下手的空档。"],
        [actorLabel, "额角冒汗，拳头攥紧又松开，仍不敢先动。"],
        [actorLabel, "后退半寸，喉咙发干，却把", foeLabel, "看得死死的。"],
      ],
      event,
    ),
  );
}

function beastHurtYou(
  event: ServerCombatEvent,
  actorName: string,
  band: DamageBand,
  kind: BeastKind,
): CombatLine {
  if (kind === "serpentine") {
    if (band === "light") {
      return assemble(
        event.seq,
        "hurt",
        pick(
          "hurt-serpent-light",
          [
            [actorName, "电射而来，毒牙", kw("擦过", "hurt"), "你小腿——火辣辣一道。"],
            [actorName, "身子一卷，鳞片", kw("刮破", "hurt"), "你腕侧薄皮。"],
            [actorName, "信子先到，牙尖", kw("点中", "hurt"), "靴筒，疼得不重。"],
            [actorName, "贴地一窜，尾梢", kw("抽中", "hurt"), "你脚踝。"],
            [actorName, "寒意贴肤——它只", kw("咬破", "hurt"), "一层皮就退开。"],
          ],
          event,
        ),
      );
    }
    if (band === "mid") {
      return assemble(
        event.seq,
        "hurt",
        pick(
          "hurt-serpent-mid",
          [
            [actorName, "猛地", kw("缠上", "hurt"), "，一口", kw("咬中", "hurt"), "你小臂。"],
            ["避无可避。", actorName, "这一", kw("扑咬", "hurt"), "结结实实，你肋下一麻。"],
            [actorName, "尾劲一绞，牙关", kw("咬住", "hurt"), "你肩头皮肉。"],
            [actorName, "鳞光一闪，已", kw("噬中", "hurt"), "你腕骨旁的软处。"],
            [actorName, "从侧翼欺近，狠狠", kw("咬下", "hurt"), "——血气涌出。"],
          ],
          event,
        ),
      );
    }
    return assemble(
      event.seq,
      "hurt",
      pick(
        "hurt-serpent-heavy",
        [
          [actorName, "如鞭抽至，连皮带肉", kw("撕咬", "hurt"), "一口——你眼前发黑。"],
          [actorName, "缠得又紧又快，一口", kw("咬住", "hurt"), "不放，寒意入骨。"],
          ["鳞声细碎里，", actorName, "已", kw("噬下", "hurt"), "血肉模糊的一块。"],
          [actorName, "尾梢勒紧，毒牙", kw("贯入", "hurt"), "——你腿软了一瞬。"],
          [actorName, "直取咽喉，你侧头不及，肩窝已被", kw("咬穿", "hurt"), "。"],
        ],
        event,
      ),
    );
  }

  if (band === "light") {
    return assemble(
      event.seq,
      "hurt",
      pick(
        "hurt-beast-light",
        [
          [actorName, "扑近，牙关", kw("咬中", "hurt"), "你袖口下的皮肉——只蹭破一点。"],
          [actorName, "爪子", kw("抓过", "hurt"), "你小腿，火辣辣一道白印。"],
          [actorName, "低吼着蹭上来，口鼻的热气喷在腕上，疼得不重。"],
          [actorName, "斜扑一下，肩头", kw("撞中", "hurt"), "你膝弯。"],
          [actorName, "利齿", kw("磕破", "hurt"), "你手背，血珠很快渗出。"],
        ],
        event,
      ),
    );
  }
  if (band === "mid") {
    return assemble(
      event.seq,
      "hurt",
      pick(
        "hurt-beast-mid",
        [
          [
            actorName,
            "猛地",
            kw("扑上", "hurt"),
            "，一口",
            kw("咬中", "hurt"),
            "你小臂，疼得一激灵。",
          ],
          [actorName, "利爪", kw("撕开", "hurt"), "袖口，血痕细长却深。"],
          ["避无可避。", actorName, "这一", kw("扑咬", "hurt"), "结结实实，你肋下一疼。"],
          [actorName, "前爪按住你肩，牙关", kw("咬下", "hurt"), "——血气四散。"],
          [actorName, "欺身一撞，再顺势", kw("咬住", "hurt"), "你腕骨不放。"],
        ],
        event,
      ),
    );
  }
  return assemble(
    event.seq,
    "hurt",
    pick(
      "hurt-beast-heavy",
      [
        [actorName, "狂性大发，连皮带肉", kw("撕咬", "hurt"), "一口——你眼前发黑，铁锈味涌上喉头。"],
        [actorName, "扑得又狠又快，一口", kw("咬住", "hurt"), "你肩头不放，血气四散。"],
        ["惨嚎般的低吼里，", actorName, "已", kw("咬下", "hurt"), "血肉模糊的一块。"],
        [actorName, "像一道黑影砸来，利爪", kw("撕开", "hurt"), "你前襟，疼入心肺。"],
        [actorName, "死死", kw("扑咬", "hurt"), "住你，你几乎抬不起手。"],
      ],
      event,
    ),
  );
}

function birdHurtYou(event: ServerCombatEvent, actorName: string, band: DamageBand): CombatLine {
  if (band === "light") {
    return assemble(
      event.seq,
      "hurt",
      pick(
        "hurt-bird-light",
        [
          [actorName, "斜掠而过，喙尖", kw("啄中", "hurt"), "你耳廓——火辣辣的。"],
          [actorName, "翅风扫过颊边，爪子", kw("刮破", "hurt"), "一层皮。"],
          [actorName, "一个侧旋，翼缘", kw("抽中", "hurt"), "你肩头。"],
          [actorName, "俯冲擦过，喙", kw("点破", "hurt"), "你手背。"],
          [actorName, "锐鸣未落，爪尖已", kw("划过", "hurt"), "你额角。"],
        ],
        event,
      ),
    );
  }
  if (band === "mid") {
    return assemble(
      event.seq,
      "hurt",
      pick(
        "hurt-bird-mid",
        [
          [actorName, "一个猛", kw("扑", "hurt"), "，利爪", kw("抠进", "hurt"), "你肩头。"],
          [actorName, "锐鸣中喙", kw("啄中", "hurt"), "你腕骨，酸麻直窜肘弯。"],
          [actorName, "从侧上方压下，爪喙齐至，你肩窝", kw("中了", "hurt"), "实打。"],
          [actorName, "翅影一罩，喙", kw("钉进", "hurt"), "你锁骨旁。"],
          [actorName, "连啄两下，第二下已", kw("啄穿", "hurt"), "袖口入肉。"],
        ],
        event,
      ),
    );
  }
  return assemble(
    event.seq,
    "hurt",
    pick(
      "hurt-bird-heavy",
      [
        [actorName, "从天而降，爪喙齐至，你头顶一凉，血顺着额角淌。"],
        [actorName, "连", kw("啄", "hurt"), "带", kw("抓", "hurt"), "，你几乎抬不起手。"],
        [actorName, "扑翅如闸，利爪", kw("撕开", "hurt"), "你肩背。"],
        [actorName, "对准面门直", kw("啄下", "hurt"), "——你眼前一阵血雾。"],
        [actorName, "翅劲一压，喙爪齐下，你跪跌半步，肩头已", kw("开花", "hurt"), "。"],
      ],
      event,
    ),
  );
}

function humanHurtYou(
  event: ServerCombatEvent,
  actorName: string,
  tier: CombatTier,
  band: DamageBand,
): CombatLine {
  if (tier === "high") {
    if (band === "light") {
      return assemble(
        event.seq,
        "hurt",
        pick(
          "hurt-human-high-light",
          [
            [actorName, "只递了半式，指风已", kw("点中", "hurt"), "你脉门——内息乱了片刻。"],
            [actorName, "袖风掠过，你腕侧一麻，已被", kw("点中", "hurt"), "。"],
            [actorName, "一指点来，你肩井穴", kw("中招", "hurt"), "，真气滞了半息。"],
            [actorName, "掌缘轻切，衣下皮肉已", kw("破了", "hurt"), "一道。"],
            [actorName, "招势未全，你颊边已", kw("挨了一记", "hurt"), "风。"],
          ],
          event,
        ),
      );
    }
    if (band === "mid") {
      return assemble(
        event.seq,
        "hurt",
        pick(
          "hurt-human-high-mid",
          [
            [actorName, "这一式如影随形。力透脊背，你退了两步，口中已泛起铁锈味。"],
            [actorName, "招势未尽，杀机先至——你肩头", kw("中招", "hurt"), "，真气散了半寸。"],
            [actorName, "一掌", kw("贯中", "hurt"), "你胸口，气血翻涌。"],
            [actorName, "脚步未乱，你却已", kw("吃了", "hurt"), "结实一记。"],
            [actorName, "指风过处，你肋下", kw("中了", "hurt"), "，冷汗直冒。"],
          ],
          event,
        ),
      );
    }
    return assemble(
      event.seq,
      "hurt",
      pick(
        "hurt-human-high-heavy",
        [
          ["气机一压。", actorName, "这一击", kw("贯中", "hurt"), "胸臆，你气血倒涌，眼前发黑。"],
          [actorName, "招式过处，天地似静——你却已", kw("中了", "hurt"), "实打，吐出一口血。"],
          [actorName, "这一掌", kw("轰在", "hurt"), "心口，你膝弯一软。"],
          [actorName, "杀机先至，你连退不及，肩背已", kw("开花", "hurt"), "。"],
          [actorName, "力透三寸，你喉头一甜，已", kw("中了", "hurt"), "重手。"],
        ],
        event,
      ),
    );
  }
  if (tier === "mid") {
    if (band === "light") {
      return assemble(
        event.seq,
        "hurt",
        pick(
          "hurt-human-mid-light",
          [
            [actorName, "一记擦过肋下，", kw("蹭破", "hurt"), "皮肉，疼得人一缩。"],
            [actorName, "拳风擦颊，你耳根", kw("火辣辣", "hurt"), "的。"],
            [actorName, "这一下", kw("打中", "hurt"), "你小臂，酸麻一阵。"],
            [actorName, "掌缘", kw("削过", "hurt"), "你肩头，衣下见红。"],
            [actorName, "脚步欺近，肘尖", kw("撞中", "hurt"), "你肋侧。"],
          ],
          event,
        ),
      );
    }
    if (band === "mid") {
      return assemble(
        event.seq,
        "hurt",
        pick(
          "hurt-human-mid-mid",
          [
            [actorName, "这一下又狠又快——你退得半步，却已", kw("吃了", "hurt"), "实打。"],
            ["避无可避。", actorName, "的力道", kw("撞上", "hurt"), "肩背，你牙关一紧。"],
            [actorName, "一拳", kw("砸中", "hurt"), "你胸口，闷哼出口。"],
            [actorName, "连环两手，第二记已", kw("命中", "hurt"), "你肋下。"],
            [actorName, "脚下一绊，掌力", kw("送上", "hurt"), "——你踉跄后退。"],
          ],
          event,
        ),
      );
    }
    return assemble(
      event.seq,
      "hurt",
      pick(
        "hurt-human-mid-heavy",
        [
          [actorName, "重重一击", kw("命中", "hurt"), "，你连退数步，差点栽倒。"],
          [actorName, "这一掌", kw("结结实实打中", "hurt"), "，你眼前发黑。"],
          [actorName, "力从脚起，你肩头被", kw("轰开", "hurt"), "，血气上涌。"],
          [actorName, "招尽之处，你已", kw("中了", "hurt"), "，跪跌半步。"],
          [actorName, "不由分说一记", kw("贯中", "hurt"), "——你吐出半口血。"],
        ],
        event,
      ),
    );
  }
  if (band === "light") {
    return assemble(
      event.seq,
      "hurt",
      pick(
        "hurt-human-low-light",
        [
          [actorName, "胡乱一抡，", kw("打中", "hurt"), "你胳膊——比拍苍蝇重些。"],
          [actorName, "拳头歪斜落下，你颊边", kw("挨了一记", "hurt"), "，火辣辣的。"],
          [actorName, "这一下", kw("砸中", "hurt"), "你肩头，疼得人一晃。"],
          [actorName, "脚下一滑，肘弯却", kw("撞上", "hurt"), "你肋。"],
          [actorName, "抓起石子似的砸来，", kw("擦破", "hurt"), "你手背。"],
        ],
        event,
      ),
    );
  }
  if (band === "mid") {
    return assemble(
      event.seq,
      "hurt",
      pick(
        "hurt-human-low-mid",
        [
          [actorName, "凭着蛮力", kw("砸中", "hurt"), "你胸口，闷哼一声，脚步乱了。"],
          [actorName, "双拳齐出，你小腹", kw("中了", "hurt"), "一记实打。"],
          [actorName, "不知哪来的狠劲，", kw("打中", "hurt"), "你肩胛。"],
          [actorName, "扑上来一记，你颊边", kw("开花", "hurt"), "。"],
          [actorName, "抡圆了胳膊", kw("砸下", "hurt"), "——你退了两步。"],
        ],
        event,
      ),
    );
  }
  return assemble(
    event.seq,
    "hurt",
    pick(
      "hurt-human-low-heavy",
      [
        [actorName, "不知哪来的狠劲，一记", kw("结结实实打中", "hurt"), "——你眼冒金星。"],
        [actorName, "整个人撞上来，你被", kw("砸翻", "hurt"), "半步，口中血腥。"],
        [actorName, "死命一击", kw("命中", "hurt"), "心口，你差点跪倒。"],
        [actorName, "抡得又猛又沉，你肩头已", kw("中了", "hurt"), "重创。"],
        [actorName, "这一下", kw("轰在", "hurt"), "肋上，你连退数步。"],
      ],
      event,
    ),
  );
}

function youHitFoe(
  event: ServerCombatEvent,
  hitTarget: string,
  foeNature: CombatNature,
  foeKind: BeastKind,
  yourTier: CombatTier,
  band: DamageBand,
): CombatLine {
  if (foeNature === "beast" || foeNature === "bird") {
    if (foeNature === "bird") {
      if (band === "light") {
        return assemble(
          event.seq,
          "damage",
          pick(
            "youhit-bird-l",
            [
              ["你抬手一记，", kw("扫中", "hit"), "翅根——", hitTarget, "吃痛斜飞，却没退远。"],
              ["你掌风递出，", kw("拍中", "hit"), "羽翼——", hitTarget, "锐鸣一声拔高。"],
              ["你出手如电，", kw("点中", "hit"), hitTarget, "翅关节，它身形一滞。"],
              ["你一记擦过，", kw("刮中", "hit"), "腹羽——血珠细细渗出。"],
              ["你跳起半尺，", kw("砸中", "hit"), hitTarget, "侧翼，它歪了半圈。"],
            ],
            event,
          ),
        );
      }
      if (band === "mid") {
        return assemble(
          event.seq,
          "damage",
          pick(
            "youhit-bird-m",
            [
              ["你这一击", kw("命中", "hit"), hitTarget, "——它闷鸣一声，扑翅乱了。"],
              ["没有花哨。你递出一记，", hitTarget, "翅根已", kw("中了", "hit"), "实打。"],
              ["你跃起反手，", kw("贯中", "hit"), hitTarget, "胸腹，它栽低半丈。"],
              ["力由脊发。你", kw("扫中", "hit"), "它翅骨，锐鸣陡变。"],
              ["你盯准落点，一记", kw("打中", "hit"), "——羽毛纷飞。"],
            ],
            event,
          ),
        );
      }
      return assemble(
        event.seq,
        "damage",
        pick(
          "youhit-bird-h",
          [
            ["你这一下又准又狠，", hitTarget, kw("哀鸣", "hit"), "着栽斜，血洒半空。"],
            ["你跃起追上，一记", kw("砸中", "hit"), "——它几乎折翅。"],
            ["杀机先至。你", kw("贯中", "hit"), hitTarget, "，它盘旋之力尽散。"],
            ["你不留余地，", kw("命中", "hit"), "翅根要害——它坠了半息。"],
            ["你掌力送尽，", hitTarget, "已被", kw("打落", "hit"), "近地。"],
          ],
          event,
        ),
      );
    }

    // beast
    if (foeKind === "serpentine") {
      if (band === "light") {
        return assemble(
          event.seq,
          "damage",
          pick(
            "youhit-serpent-l",
            [
              ["你抬脚一记，", kw("踢中", "hit"), "蛇身——", hitTarget, "吃痛一缩。"],
              ["你掌缘横切，", kw("砸中", "hit"), "七寸旁，鳞片一颤。"],
              ["你递出一指，", kw("点中", "hit"), hitTarget, "侧腹，它扭身退去。"],
              ["你出手如风，", kw("打中", "hit"), "尾段——尘土扬起。"],
              ["你侧身欺近，", kw("按中", "hit"), "它颈后，力道不重。"],
            ],
            event,
          ),
        );
      }
      if (band === "mid") {
        return assemble(
          event.seq,
          "damage",
          pick(
            "youhit-serpent-m",
            [
              ["你这一击", kw("命中", "hit"), hitTarget, "——它嘶声扭曲，鳞光乱颤。"],
              ["力由脊发。你", kw("砸中", "hit"), "七寸附近，它身躯一僵。"],
              ["你踩住半截蛇身，一记", kw("贯中", "hit"), "——涎水混着血。"],
              ["没有花哨。你只递一记，", hitTarget, "已", kw("中了", "hit"), "实打。"],
              ["你盯准起伏，", kw("打中", "hit"), "它腰腹，盘绕之力散了。"],
            ],
            event,
          ),
        );
      }
      return assemble(
        event.seq,
        "damage",
        pick(
          "youhit-serpent-h",
          [
            ["你这一下又准又狠，", hitTarget, kw("哀鸣", "hit"), "着弹开，鳞片翻起。"],
            ["你狠狠", kw("砸中", "hit"), "七寸——它几乎瘫软。"],
            ["杀机落地。你", kw("贯中", "hit"), hitTarget, "，血沫溅尘。"],
            ["你不留余地，一记", kw("命中", "hit"), "要害——它抽搐不止。"],
            ["你掌力送尽，", hitTarget, "已被", kw("打得", "hit"), "蜷成一团。"],
          ],
          event,
        ),
      );
    }

    if (band === "light") {
      return assemble(
        event.seq,
        "damage",
        pick(
          "youhit-beast-l",
          [
            ["你抬手一记，", kw("砸中", "hit"), "肩胛——", hitTarget, "吃痛一缩，却没退远。"],
            ["你递出一掌，", kw("踢中", "hit"), "肋侧——", hitTarget, "低吼着横移。"],
            ["你出手，", kw("劈中", "hit"), "后颈皮毛，它身子一抖。"],
            ["你侧身欺近，", kw("打中", "hit"), hitTarget, "前腿关节。"],
            ["你掌风擦过，", kw("刮中", "hit"), "鼻梁旁——血丝细细渗出。"],
          ],
          event,
        ),
      );
    }
    if (band === "mid") {
      return assemble(
        event.seq,
        "damage",
        pick(
          "youhit-beast-m",
          [
            ["力由脊发。你这一击", kw("命中", "hit"), hitTarget, "——它闷嚎一声，爪子乱刨。"],
            ["你只递出一记干脆的着子，", hitTarget, "肩头已", kw("中了", "hit"), "实打。"],
            ["你盯准破绽，", kw("砸中", "hit"), "肋侧——涎水甩落。"],
            ["没有花哨。你", kw("贯中", "hit"), hitTarget, "胸口，它退了半步。"],
            ["你跃步跟上，一记", kw("打中", "hit"), "——它呲牙却已露怯。"],
          ],
          event,
        ),
      );
    }
    return assemble(
      event.seq,
      "damage",
      pick(
        "youhit-beast-h",
        [
          ["你这一下又准又狠，", hitTarget, kw("哀嚎", "hit"), "着踉跄后退，涎水混着血。"],
          ["你不留余地，", kw("砸中", "hit"), "后颈——它腿下一软。"],
          ["杀机先至。你", kw("贯中", "hit"), hitTarget, "，它扑势尽散。"],
          ["你掌力送尽，", hitTarget, "已被", kw("打翻", "hit"), "在尘土里。"],
          ["你盯死喉下，一记", kw("命中", "hit"), "——血气四散。"],
        ],
        event,
      ),
    );
  }

  // human foe
  if (yourTier === "high") {
    if (band === "light") {
      return assemble(
        event.seq,
        "damage",
        pick(
          "youhit-human-high-l",
          [
            ["你指风轻点，已", kw("点中", "hit"), hitTarget, "脉门——他脸色微变。"],
            ["你袖里递指，", kw("点中", "hit"), hitTarget, "肩井，他气息一滞。"],
            ["招势未全，你已", kw("擦中", "hit"), hitTarget, "腕侧。"],
            ["你脚步一错，掌缘", kw("削过", "hit"), hitTarget, "颊边。"],
            ["你只递半式，", hitTarget, "衣下已", kw("见红", "hit"), "。"],
          ],
          event,
        ),
      );
    }
    if (band === "mid") {
      return assemble(
        event.seq,
        "damage",
        pick(
          "youhit-human-high-m",
          [
            ["招势过处。", hitTarget, "胸前一沉，被你", kw("贯中", "hit"), "，气息散了半寸。"],
            ["气机一转，你这一式", kw("命中", "hit"), hitTarget, "肩头。"],
            ["你力透脊背，", hitTarget, "已", kw("中了", "hit"), "实打，退了两步。"],
            ["杀机先至。你", kw("点中", "hit"), hitTarget, "胸口要穴。"],
            ["你不闪不避，一掌", kw("送上", "hit"), "——他闷哼出口。"],
          ],
          event,
        ),
      );
    }
    return assemble(
      event.seq,
      "damage",
      pick(
        "youhit-human-high-h",
        [
          ["气机一转，你这一式", kw("命中", "hit"), hitTarget, "——他连退数步，鲜血狂喷。"],
          ["你掌力尽吐，", hitTarget, "已被", kw("贯中", "hit"), "，跪跌尘土。"],
          ["天地似静。你这一击", kw("结结实实命中", "hit"), "——胜负已现端倪。"],
          ["你盯死破绽，", kw("轰在", "hit"), hitTarget, "心口。"],
          ["招尽之处，", hitTarget, "吐血而退，已被你", kw("打中", "hit"), "要害。"],
        ],
        event,
      ),
    );
  }
  if (yourTier === "mid") {
    if (band === "light") {
      return assemble(
        event.seq,
        "damage",
        pick(
          "youhit-human-mid-l",
          [
            ["你一记擦过", hitTarget, "肩头，", kw("划出", "hit"), "一道细长血痕。"],
            ["你递掌，", kw("打中", "hit"), hitTarget, "小臂，他手腕一麻。"],
            ["你脚步欺近，肘尖", kw("撞中", "hit"), hitTarget, "肋下。"],
            ["你掌缘横切，", kw("削过", "hit"), hitTarget, "颊边。"],
            ["你出手不重，却", kw("点中", "hit"), hitTarget, "腕骨。"],
          ],
          event,
        ),
      );
    }
    if (band === "mid") {
      return assemble(
        event.seq,
        "damage",
        pick(
          "youhit-human-mid-m",
          [
            ["力由脊发。你这一击落在", hitTarget, "身上——他闷哼一声，脚步乱了。"],
            ["你只递出一记干脆的着子，", hitTarget, "肩头已", kw("吃了", "hit"), "实打。"],
            ["你连环两手，第二记", kw("命中", "hit"), hitTarget, "胸口。"],
            ["没有花哨。你", kw("砸中", "hit"), hitTarget, "，他牙关一紧。"],
            ["你盯准空档，一记", kw("贯中", "hit"), "——他退了半步。"],
          ],
          event,
        ),
      );
    }
    return assemble(
      event.seq,
      "damage",
      pick(
        "youhit-human-mid-h",
        [
          ["你这一击", kw("结结实实命中", "hit"), "，", hitTarget, "退了好几步，差点摔倒。"],
          ["你掌力送尽，", hitTarget, "已被", kw("打中", "hit"), "，口中血腥。"],
          ["杀机落地。你", kw("轰在", "hit"), hitTarget, "肋上，他跪跌半步。"],
          ["你不留余地，", kw("命中", "hit"), "心口——他眼前发黑。"],
          ["你跃步跟上，一记", kw("贯中", "hit"), "——他再也站不稳。"],
        ],
        event,
      ),
    );
  }
  if (band === "light") {
    return assemble(
      event.seq,
      "damage",
      pick(
        "youhit-human-low-l",
        [
          ["你胡乱挥出一记，总算", kw("打中", "hit"), hitTarget, "胳膊——他骂了一声。"],
          ["你凭着一口气", kw("砸中", "hit"), hitTarget, "肩头。"],
          ["你拳头歪斜落下，仍", kw("挨中", "hit"), hitTarget, "颊边。"],
          ["你扑上去一记，", kw("打中", "hit"), hitTarget, "小腹。"],
          ["你抓起劲来，", kw("撞中", "hit"), hitTarget, "胸口。"],
        ],
        event,
      ),
    );
  }
  if (band === "mid") {
    return assemble(
      event.seq,
      "damage",
      pick(
        "youhit-human-low-m",
        [
          ["你凭着一口气", kw("砸中", "hit"), hitTarget, "胸口，他闷哼着退开。"],
          ["你抡圆了胳膊，", kw("打中", "hit"), hitTarget, "——他脚步乱了。"],
          ["你不知哪来的狠劲，", kw("命中", "hit"), hitTarget, "肩胛。"],
          ["你整个人撞上去，", hitTarget, "被你", kw("砸中", "hit"), "。"],
          ["你死命一击，", kw("贯中", "hit"), hitTarget, "肋下。"],
        ],
        event,
      ),
    );
  }
  return assemble(
    event.seq,
    "damage",
    pick(
      "youhit-human-low-h",
      [
        ["你不知哪来的狠劲，一记", kw("打中", "hit"), hitTarget, "——他像一捆稻草般晃了晃。"],
        ["你豁出去了，", kw("砸中", "hit"), hitTarget, "——他眼前发黑。"],
        ["你连退带打，最后一记", kw("命中", "hit"), "心口。"],
        ["你吼声未落，拳头已", kw("结结实实打中", "hit"), hitTarget, "。"],
        ["你拼尽全力，", hitTarget, "被你", kw("轰翻", "hit"), "半步。"],
      ],
      event,
    ),
  );
}

/**
 * 闪避：一句闭环 = 攻方起手 + 守方躲开。
 * 守方为兽/鸟时禁「衣角/招式」等人设词。
 */
function dodgeLine(
  event: ServerCombatEvent,
  actorName: string,
  hitTarget: string,
  attackerNature: CombatNature,
  defenderNature: CombatNature,
  attackerKind: BeastKind,
  fromPlayer: boolean,
): CombatLine {
  // 兽攻 → 人/兽闪
  if (attackerNature === "beast") {
    if (attackerKind === "serpentine") {
      return assemble(
        event.seq,
        "dodge",
        pick(
          "dodge-serpent-atk",
          [
            [
              actorName,
              "电射而来——",
              hitTarget,
              "横移半步，毒牙",
              kw("扑空", "dodge"),
              "，只带起一阵腥风。",
            ],
            [actorName, "身子一卷扑上，", hitTarget, "就地一滚，鳞光", kw("擦空", "dodge"), "。"],
            [
              "差一点。",
              actorName,
              "信子先到——",
              hitTarget,
              "已",
              kw("闪避", "dodge"),
              "开，尘土在脚边打旋。",
            ],
            [actorName, "贴地窜来，", hitTarget, "提气拔高半寸，尾梢", kw("抽空", "dodge"), "。"],
            [hitTarget, "侧让寸许。", actorName, "这一", kw("噬", "dodge"), "落空，寒意掠过脚踝。"],
          ],
          event,
        ),
      );
    }
    return assemble(
      event.seq,
      "dodge",
      pick(
        "dodge-beast-atk",
        [
          [
            actorName,
            "猛地",
            kw("扑上", "dodge"),
            "——",
            hitTarget,
            "横移半步，利爪只带起一阵土腥。",
          ],
          [
            actorName,
            "牙关咔嚓合上——",
            hitTarget,
            "已",
            kw("闪避", "dodge"),
            "开，尘土在脚边打了个旋。",
          ],
          [hitTarget, "就地一滚，", actorName, "的利爪", kw("抓空", "dodge"), "，刨起一片碎石。"],
          [actorName, "低吼着欺近，", hitTarget, "脚下一拧，这一", kw("扑", "dodge"), "落空。"],
          [
            "风声先至。",
            actorName,
            "扑杀而来——",
            hitTarget,
            "让开半寸，牙关",
            kw("咬空", "dodge"),
            "。",
          ],
        ],
        event,
      ),
    );
  }

  if (attackerNature === "bird") {
    return assemble(
      event.seq,
      "dodge",
      pick(
        "dodge-bird-atk",
        [
          [actorName, "一个猛", kw("扑啄", "dodge"), "——", hitTarget, "低头一矮，喙尖擦过发梢。"],
          [actorName, "翅影罩下，", hitTarget, "侧滚开去，利爪", kw("抓空", "dodge"), "。"],
          ["锐鸣中，", actorName, "俯冲而来——", hitTarget, "已", kw("闪避", "dodge"), "开。"],
          [actorName, "连啄两下，第二下被", hitTarget, kw("让开", "dodge"), "，只余翅风。"],
          [hitTarget, "提气拔高。", actorName, "这一", kw("扑", "dodge"), "落空，羽毛乱颤。"],
        ],
        event,
      ),
    );
  }

  // 人攻 → 守方分流
  if (defenderNature === "beast") {
    return assemble(
      event.seq,
      "dodge",
      pick(
        "dodge-human-vs-beast",
        [
          [
            fromPlayer ? "你一掌拍去——" : actorName + "一掌拍去——",
            hitTarget,
            "侧身一滚，这一记",
            kw("扑了个空", "dodge"),
            "。",
          ],
          [
            fromPlayer ? "你斩落——" : actorName + "斩落——",
            hitTarget,
            "身形一晃，爪子刨地，硬是",
            kw("躲开", "dodge"),
            "了。",
          ],
          [
            fromPlayer ? "你递出一记——" : actorName + "递出一记——",
            hitTarget,
            "低伏着窜开，力道",
            kw("砸空", "dodge"),
            "，只扬起尘土。",
          ],
          [
            fromPlayer ? "你出手如风——" : actorName + "出手如风——",
            hitTarget,
            "偏头让过，牙关空咬一声，算是",
            kw("闪避", "dodge"),
            "开来。",
          ],
          [
            fromPlayer ? "你欺近就打——" : actorName + "欺近就打——",
            hitTarget,
            "后撤半步，肩背一拧，力道",
            kw("落空", "dodge"),
            "。",
          ],
        ],
        event,
      ),
    );
  }
  if (defenderNature === "bird") {
    return assemble(
      event.seq,
      "dodge",
      pick(
        "dodge-human-vs-bird",
        [
          [
            fromPlayer ? "你掌风递出——" : actorName + "掌风递出——",
            hitTarget,
            "拔高半丈，这一记",
            kw("扑了个空", "dodge"),
            "。",
          ],
          [
            fromPlayer ? "你跃起就打——" : actorName + "跃起就打——",
            hitTarget,
            "翅影一斜，已",
            kw("躲开", "dodge"),
            "。",
          ],
          [
            fromPlayer ? "你盯准落点——" : actorName + "盯准落点——",
            hitTarget,
            "一个侧旋，力道",
            kw("砸空", "dodge"),
            "。",
          ],
          [
            fromPlayer ? "你出手——" : actorName + "出手——",
            hitTarget,
            "锐鸣着扬起，羽毛乱颤，算是",
            kw("闪避", "dodge"),
            "开来。",
          ],
          [
            fromPlayer ? "你连环两手——" : actorName + "连环两手——",
            hitTarget,
            "第二记到来前已",
            kw("让开", "dodge"),
            "。",
          ],
        ],
        event,
      ),
    );
  }

  // 人攻人
  return assemble(
    event.seq,
    "dodge",
    pick(
      "dodge-human-vs-human",
      [
        [
          fromPlayer ? "你一记递出——" : actorName + "一记递出——",
          hitTarget,
          "侧身半寸，招式擦过，只带起一阵空风——",
          kw("闪避", "dodge"),
          "开来。",
        ],
        [
          "差一点。",
          fromPlayer ? "你" : actorName,
          "这一招落空，",
          hitTarget,
          "已",
          kw("躲开", "dodge"),
          "，尘土在脚边打了个旋。",
        ],
        [
          fromPlayer ? "你出手如电——" : actorName + "出手如电——",
          "没有人看清那一瞬——",
          hitTarget,
          "已让开，招式",
          kw("扑了个空", "dodge"),
          "。",
        ],
        fromPlayer
          ? [hitTarget, "脚步一滑，竟", kw("躲开", "dodge"), "了你这一记。"]
          : ["你脚步一滑，竟", kw("躲开", "dodge"), "了", actorName, "这一记。"],
        [
          fromPlayer ? "你掌力送上——" : actorName + "掌力送上——",
          hitTarget,
          "肩头一沉，人已",
          kw("让开", "dodge"),
          "半步。",
        ],
      ],
      event,
    ),
  );
}

/**
 * 招架：一句闭环 = 攻方起手 + 守方硬接。
 * 兽/鸟守方禁肘/虎口/腕骨/架势/衣角。
 */
function parryLine(
  event: ServerCombatEvent,
  actorName: string,
  hitTarget: string,
  attackerNature: CombatNature,
  defenderNature: CombatNature,
  defenderKind: BeastKind,
  fromPlayer: boolean,
): CombatLine {
  const atkLead = actorName;

  if (defenderNature === "beast") {
    if (defenderKind === "serpentine") {
      return assemble(
        event.seq,
        "parry",
        pick(
          "parry-serpent",
          [
            [
              fromPlayer ? "你斩落——" : `${atkLead}攻来——`,
              hitTarget,
              "身子一卷，鳞片",
              kw("硬接", "parry"),
              "这一击，震得沙沙作响。",
            ],
            [
              fromPlayer ? "你一掌拍去——" : `${atkLead}一记砸来——`,
              hitTarget,
              "尾梢横扫，",
              kw("挡下", "parry"),
              "力道，颈项却僵了一瞬。",
            ],
            [
              fromPlayer ? "你递出杀招——" : `${atkLead}杀招递到——`,
              hitTarget,
              "偏头用身躯",
              kw("扛住", "parry"),
              "，鳞光乱颤。",
            ],
            [
              fromPlayer ? "你力透三寸——" : `${atkLead}力透三寸——`,
              hitTarget,
              "盘成一团，",
              kw("架住了", "parry"),
              "这一下，涎水滴落。",
            ],
            [
              fromPlayer ? "你欺近就打——" : `${atkLead}欺近就打——`,
              hitTarget,
              "信子一收，用背脊",
              kw("硬生生接住", "parry"),
              "，骨节发麻。",
            ],
          ],
          event,
        ),
      );
    }
    return assemble(
      event.seq,
      "parry",
      pick(
        "parry-beast",
        [
          [
            fromPlayer ? "你斩落——" : `${atkLead}攻来——`,
            hitTarget,
            "偏头用肩颈",
            kw("硬扛", "parry"),
            "，牙关咬得咯吱响。",
          ],
          [
            fromPlayer ? "你一掌拍去——" : `${atkLead}一记砸来——`,
            hitTarget,
            "前爪撑地，用身躯",
            kw("挡下", "parry"),
            "这一击，肩背猛颤。",
          ],
          [
            fromPlayer ? "你递出杀招——" : `${atkLead}杀招递到——`,
            hitTarget,
            "低吼着侧身，以肩",
            kw("硬接", "parry"),
            "，涎水甩落。",
          ],
          [
            fromPlayer ? "你力透脊背——" : `${atkLead}力道沉沉——`,
            hitTarget,
            "呲牙",
            kw("扛住了", "parry"),
            "，爪子深刨进土里。",
          ],
          [
            fromPlayer ? "你欺近就打——" : `${atkLead}欺近就打——`,
            hitTarget,
            "不退反进，用头颈",
            kw("顶开", "parry"),
            "这一记，却也震得发麻。",
          ],
        ],
        event,
      ),
    );
  }

  if (defenderNature === "bird") {
    return assemble(
      event.seq,
      "parry",
      pick(
        "parry-bird",
        [
          [
            fromPlayer ? "你掌风递出——" : `${atkLead}攻来——`,
            hitTarget,
            "扑翅横截，以翅骨",
            kw("硬接", "parry"),
            "，羽毛纷飞。",
          ],
          [
            fromPlayer ? "你跃起就打——" : `${atkLead}跃起就打——`,
            hitTarget,
            "翅影一翻，",
            kw("挡下", "parry"),
            "力道，身形却矮了半寸。",
          ],
          [
            fromPlayer ? "你盯准落点——" : `${atkLead}盯准落点——`,
            hitTarget,
            "锐鸣一声，用爪",
            kw("格开", "parry"),
            "这一击。",
          ],
          [
            fromPlayer ? "你连环出手——" : `${atkLead}连环出手——`,
            hitTarget,
            "双翅合拢，",
            kw("扛住了", "parry"),
            "，风声尖啸。",
          ],
          [
            fromPlayer ? "你杀招已至——" : `${atkLead}杀招已至——`,
            hitTarget,
            "侧飞半圈，以翼",
            kw("硬生生接住", "parry"),
            "。",
          ],
        ],
        event,
      ),
    );
  }

  // 人守
  const humanAtkLead = fromPlayer
    ? "你"
    : attackerNature === "beast"
      ? `${actorName}扑来——`
      : attackerNature === "bird"
        ? `${actorName}扑啄而下——`
        : `${actorName}一记砸来——`;

  return assemble(
    event.seq,
    "parry",
    pick(
      "parry-human",
      [
        [
          fromPlayer ? "你攻来——" : humanAtkLead,
          hitTarget,
          "横开架势，硬生生把这一击",
          kw("招架", "parry"),
          "住。虎口发麻，人却没退。",
        ],
        [
          fromPlayer ? "你斩落——" : humanAtkLead,
          "金石相交，一串短响。",
          hitTarget,
          kw("架住了", "parry"),
          "，腕骨隐隐发酸。",
        ],
        [
          fromPlayer ? "你杀招递到——" : humanAtkLead,
          hitTarget,
          "以肘硬接，",
          kw("挡下", "parry"),
          "这记，肩头却震得发麻。",
        ],
        [
          fromPlayer ? "你力透三寸——" : humanAtkLead,
          hitTarget,
          "沉肩",
          kw("硬接", "parry"),
          "，脚下刨出两道痕。",
        ],
        [
          fromPlayer ? "你欺近就打——" : humanAtkLead,
          hitTarget,
          "双手交叉，",
          kw("格开", "parry"),
          "这一击，虎口却已裂开。",
        ],
      ],
      event,
    ),
  );
}

/** 事件 → 叙事行（PVE 战斗与 PVP 回放共用）。 */
export function narrateBattleEvent(
  event: ServerCombatEvent,
  playerName: string,
  enemyName: string,
  options?: BattleLineOptions,
): CombatLine | null {
  const resolve = options?.names ?? ((actor) => (actor === "a" || !actor ? playerName : enemyName));
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
  const damage = typeof data.damage === "number" ? data.damage : 0;
  const actorNature = natureOf(event.actor, fromPlayer ? playerName : actorName, options);
  const targetNature = natureOf(
    targetId ?? (fromPlayer ? "b" : "a"),
    hitTarget === "你" ? playerName : hitTarget,
    options,
  );
  const actorKind = beastKindOf(
    event.actor,
    nameForKind(event.actor, fromPlayer ? playerName : actorName, options),
    options,
  );
  const targetKind = beastKindOf(
    targetId ?? (fromPlayer ? "b0" : "a"),
    hitTarget === "你" ? playerName : hitTarget,
    options,
  );
  const actorTier = tierOf(event.actor, options);
  const yourTier = tierOf("a", options);
  const targetMaxQi = maxQiOf(targetId ?? (fromPlayer ? undefined : "a"), options);
  const band = damageBand(damage, targetMaxQi);

  switch (event.type) {
    case "battle_start": {
      recentPickByPool.clear();
      const primaryNature = natureOf("b0", enemyName, options);
      if (foeCount > 1 || foeNames.length > 1) {
        const list = foeNames.length > 0 ? foeNames.join("、") : "数人";
        if (primaryNature === "beast") {
          return assemble(
            event.seq,
            "start",
            pick(
              "start-multi-beast",
              [
                ["腥风先至。", list, "已将退路堵死——低吼连成一片，随时会扑。"],
                [list, "围上来，涎水滴在尘土里。这一场，注定要应付群畜。"],
                ["四下脚步乱响。", list, "呲牙围定，扑杀之意先至。"],
                ["退路被堵死。", list, "低吼此起彼伏，眼都绿了。"],
                ["风里尽是兽息。", list, "已合围——一触即发。"],
              ],
              event,
            ),
          );
        }
        return assemble(
          event.seq,
          "start",
          pick(
            "start-multi-human",
            [
              ["风忽然静了。", list, "已将退路堵死——这一场，注定要一个人应付多方。"],
              [list, "围上来。杀意像潮水，一寸寸漫过脚面。"],
              ["刀光未闪，", list, "已合围。杀机先至。"],
              ["退路断了。", list, "目光齐齐钉在你身上。"],
              ["四下无声。", list, "只等谁先递出第一招。"],
            ],
            event,
          ),
        );
      }
      if (primaryNature === "beast") {
        return assemble(
          event.seq,
          "start",
          pick(
            "start-beast",
            [
              [enemyName, "呲着牙横在眼前。四下无声，只余它喉咙里的低吼——下一息便可能扑来。"],
              ["与", enemyName, "对上了。兽瞳发绿，扑杀之意先至。"],
              [enemyName, "伏低身躯，爪子刨土。对上了——它随时会扑。"],
              ["腥风扑面。", enemyName, "拦在眼前，牙关开合，杀机已至。"],
              ["与", enemyName, "对上了。低吼一声，尘土微颤。"],
            ],
            event,
          ),
        );
      }
      if (primaryNature === "bird") {
        return assemble(
          event.seq,
          "start",
          pick(
            "start-bird",
            [
              [enemyName, "盘旋头顶。锐鸣一声，风都尖了——随时会扑啄而下。"],
              ["与", enemyName, "对上了。翅影罩顶，杀机先至。"],
              [enemyName, "尖鸣着掠过。对上了——下一息便可能下扑。"],
              ["风声陡尖。", enemyName, "在空中盘旋，盯死了你。"],
              ["与", enemyName, "对上了。羽毛逆光，扑杀之意已至。"],
            ],
            event,
          ),
        );
      }
      return assemble(
        event.seq,
        "start",
        pick(
          "start-human",
          [
            [enemyName, "横在眼前。四下无声，只余彼此的呼吸——只待谁先出招。"],
            ["与", enemyName, "对上了。刀未出鞘，杀机先至。"],
            [enemyName, "拦路而立。对上了——杀意已压到鼻尖。"],
            ["风忽然静了。", enemyName, "目光钉来，这一场避无可避。"],
            ["与", enemyName, "对上了。一步之遥，生死未分。"],
          ],
          event,
        ),
      );
    }
    case "damage":
      if (fromPlayer) {
        return youHitFoe(event, hitTarget, targetNature, targetKind, yourTier, band);
      }
      if (actorNature === "beast") return beastHurtYou(event, actorName, band, actorKind);
      if (actorNature === "bird") return birdHurtYou(event, actorName, band);
      return humanHurtYou(event, actorName, actorTier, band);
    case "parry":
      return parryLine(
        event,
        actorName,
        hitTarget,
        actorNature,
        targetNature,
        targetKind,
        fromPlayer,
      );
    case "miss":
    case "dodge":
      return dodgeLine(
        event,
        actorName,
        hitTarget,
        actorNature,
        targetNature,
        actorKind,
        fromPlayer,
      );
    case "recover":
      return assemble(
        event.seq,
        "recover",
        pick(
          "recover",
          [
            [actorName, "沉息归元。浊气下沉，清气上升，肩背松了半分。"],
            ["丹田一点暖意散开。", actorName, "稳住了阵脚，呼吸渐沉。"],
            [actorName, "退半步调息，把乱了的真气重新压回腰眼。"],
            ["浊气吐尽。", actorName, "眼前清亮了些，又能撑下一息。"],
            [actorName, "掌心按住伤处，内息一转，疼意淡了半分。"],
          ],
          event,
        ),
      );
    case "perform":
      return assemble(
        event.seq,
        "perform",
        performName
          ? pick(
              "perform-named",
              [
                [
                  "气机一转。你使出「",
                  kw(performName, "perform"),
                  "」——",
                  hitTarget,
                  "眼前一花，竟来不及完整看清那一式。",
                ],
                [
                  "「",
                  kw(performName, "perform"),
                  "」！你起手便是杀机。等风声落定，",
                  hitTarget,
                  "才觉出身上已中了一记。",
                ],
                [
                  "你指尖微颤，真气随招走。「",
                  kw(performName, "perform"),
                  "」递出，",
                  hitTarget,
                  "退无可退。",
                ],
                [
                  "杀机落地。「",
                  kw(performName, "perform"),
                  "」一出，",
                  hitTarget,
                  "只觉劲风扑面。",
                ],
                ["你足下一蹬，使出「", kw(performName, "perform"), "」——", hitTarget, "避之不及。"],
              ],
              event,
            )
          : pick(
              "perform-anon",
              [
                ["气机一转，绝招已出。短促，凌厉，不留余地。"],
                ["这一式来得又急又准——对手心神最松的一瞬，你已递到了。"],
                ["你起手便是杀机，绝学递出，风声尖啸。"],
                ["真气外放。这一招不留后路，只求一击。"],
                ["你足尖一点，绝招已至对方眼前。"],
              ],
              event,
            ),
      );
    case "perform_failed":
      return assemble(
        event.seq,
        "danger",
        pick(
          "perform-fail",
          [
            [actorName, "气息未继，这一式终究散在半途。"],
            ["真气一滞。", actorName, "想发的那一招，只余半截余势。"],
            [actorName, "内息紊乱，绝招半途而废。"],
            ["力不从心。", actorName, "这一式只递出了半成。"],
            [actorName, "丹田一空，杀招散作虚风。"],
          ],
          event,
        ),
      );
    case "flee":
      return assemble(
        event.seq,
        "danger",
        data.success === true
          ? pick(
              "flee-ok",
              [
                [actorName, "虚晃一步，身形已没入烟尘。"],
                ["退路虽窄，", actorName, "还是从杀机缝里钻了出去。"],
                [actorName, "抽身而去，留下一串乱脚印。"],
                ["风起处，", actorName, "已不见踪影。"],
                [actorName, "宁弃这一场，也要从死地里滚出去。"],
              ],
              event,
            )
          : pick(
              "flee-fail",
              [
                [actorName, "想退，对手却缠上来，退路被堵死了。"],
                ["抽身不及。", actorName, "刚挪半步，便被杀气压了回去。"],
                [actorName, "转身欲逃，却被对方截住去路。"],
                ["退无可退。", actorName, "这一步终究没迈出去。"],
                [actorName, "想走，杀机却先封住了四周。"],
              ],
              event,
            ),
      );
    case "foe_down": {
      const fallen = typeof data.name === "string" ? data.name : actorName;
      const fallenNature = natureOf(event.actor, fallen, options);
      const fallenKind = inferBeastKind(fallen);
      if (fallenNature === "beast") {
        if (fallenKind === "serpentine") {
          return assemble(
            event.seq,
            "down",
            pick(
              "down-serpent",
              [
                [fallen, "尾力一散，瘫软在尘土里——信子不再吐了。"],
                ["风过处，", fallen, "已伏。鳞光渐暗，抽搐两下便静了。"],
                [fallen, "盘不住身子，软成一堆——这一场，它完了。"],
                ["腥气散去。", fallen, "不动了。"],
                [fallen, "七寸一松，再抬不起头。"],
              ],
              event,
            ),
          );
        }
        return assemble(
          event.seq,
          "down",
          pick(
            "down-beast",
            [
              [fallen, "腿下一软，栽进尘土——喉咙里的低吼断了。"],
              ["风过处，", fallen, "已伏。爪子抽搐两下，便静了。"],
              [fallen, "哀嚎一声，侧倒在地，再爬不起来。"],
              ["尘土落定。", fallen, "牙关松开，气息绝了。"],
              [fallen, "前腿一软，扑倒——兽瞳里的绿光灭了。"],
            ],
            event,
          ),
        );
      }
      if (fallenNature === "bird") {
        return assemble(
          event.seq,
          "down",
          pick(
            "down-bird",
            [
              [fallen, "翅力一散，栽落尘土——锐鸣断了。"],
              ["风过处，", fallen, "已伏。羽毛乱颤两下，便静了。"],
              [fallen, "哀鸣一声，折翅坠地。"],
              ["空中再无翅影。", fallen, "不动了。"],
              [fallen, "扑腾几下，终究没再飞起来。"],
            ],
            event,
          ),
        );
      }
      return assemble(
        event.seq,
        "down",
        pick(
          "down-human",
          [
            [fallen, "膝下一软，栽进尘土——一时起不来了。"],
            ["风过处，", fallen, "已伏。余劲还在，人却静了。"],
            [fallen, "吐血踉跄，终究跪倒在地。"],
            ["尘埃落定。", fallen, "再抬不起手。"],
            [fallen, "眼前一黑，栽倒——这一场，他完了。"],
          ],
          event,
        ),
      );
    }
    case "busy":
      return assemble(
        event.seq,
        "danger",
        pick(
          "busy",
          [
            [actorName, "真气未稳，这一式只得暂缓。"],
            ["气息还在归位。", actorName, "只能先守，不能抢攻。"],
            [actorName, "内息紊乱，暂时递不出杀招。"],
            ["余劲未消。", actorName, "脚步发飘，只得稳住。"],
            [actorName, "丹田一滞，攻势只好先按住。"],
          ],
          event,
        ),
      );
    case "set_jiali": {
      const level = typeof data.jiali === "number" ? data.jiali : 0;
      if (level <= 0) {
        return assemble(event.seq, "recover", [actorName, "收回加力，内息复归平稳。"]);
      }
      return assemble(
        event.seq,
        "recover",
        pick(
          "jiali",
          [
            [actorName, `运劲加力至${level}成，掌心隐隐发热。`],
            ["丹田一紧。", actorName, `把加力提到${level}成，杀机更重了半分。`],
            [actorName, `加力提至${level}成，衣袂无风自动。`],
            ["真气外放。", actorName, `加力${level}成，掌缘隐隐作响。`],
            [actorName, `咬牙加力到${level}成，这一记会更重。`],
          ],
          event,
        ),
      );
    }
    case "poison_tick":
      return assemble(
        event.seq,
        "hurt",
        pick(
          "poison",
          [
            [actorName, "体内一麻，毒气又啃去一分元气。"],
            ["寒意沿经脉爬行。", actorName, "脸色微青，却仍咬牙站住。"],
            [actorName, "毒发得紧，眼前一阵发黑。"],
            ["内息被蚀。", actorName, "唇色发暗，脚步却未乱。"],
            [actorName, "毒气翻涌，又逼出一身冷汗。"],
          ],
          event,
        ),
      );
    case "victory":
      return assemble(
        event.seq,
        "victory",
        pick(
          "victory",
          [
            ["胜负已分。余劲散在风里，像一场未写完的句号。"],
            ["尘埃落定。四下忽然静得能听见自己的心跳。"],
            ["这一场，终究有了结果。风过处，再无杀机。"],
            ["胜负已分。刀光散尽，只余喘息。"],
            ["尘土落定。生死之间，你还站着。"],
          ],
          event,
        ),
      );
    case "reward":
      return assemble(
        event.seq,
        "victory",
        pick(
          "reward",
          [
            ["这一程所得，已收入行囊。"],
            ["战利入囊。江湖路远，先带走眼前这点。"],
            ["所得已清点妥当。"],
            ["行囊又重了几分。"],
            ["这一场的收获，先收好再说。"],
          ],
          event,
        ),
      );
    case "quest_progress":
      return assemble(
        event.seq,
        "normal",
        pick(
          "quest",
          [
            ["手头的请托，也向前走了一步。"],
            ["这一战之后，肩上的差事轻了半分。"],
            ["请托有了着落，心头松了口气。"],
            ["差事推进一分，江湖路也好走些。"],
            ["这一刀，也算对得起肩上的托付。"],
          ],
          event,
        ),
      );
    case "draw":
      return assemble(
        event.seq,
        "danger",
        pick(
          "draw",
          [
            ["两下分开，谁也没有再追。"],
            ["未分胜负。风里只余各自的喘息。"],
            ["两边都收了手。尘土未定，杀机却散了。"],
            ["再打下去，谁也讨不了好——两边默契地停了。"],
            ["未分高下。夕阳把两人的影子拉得很长。"],
          ],
          event,
        ),
      );
    case "turn_start": {
      const turn = typeof data.turn === "number" ? data.turn : event.seq;
      if (turn % 2 === 1) return null;
      const focusPlayer = turn % 4 === 0;
      const focusActor = focusPlayer ? "a" : "b0";
      const focusName = focusPlayer ? "你" : resolve(focusActor);
      const foeLabel = focusPlayer ? enemyName : "你";
      return atmosphereLine(
        event,
        focusName,
        foeLabel,
        natureOf(focusActor, focusName === "你" ? playerName : focusName, options),
        focusPlayer ? yourTier : tierOf(focusActor, options),
      );
    }
    default:
      return null;
  }
}

/** 测试用：清空模板短记忆。 */
export function resetNarrativePickMemory(): void {
  recentPickByPool.clear();
}
