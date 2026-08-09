/**
 * 战斗叙事（借鉴 xkx 击间闲笔 / 人兽分流 / 分级伤势神韵，文案原创）。
 * 着色只落在关键字词（命中、闪避、咬中、招式名…），非整行染色。
 */

import type { CombatLine, CombatLineKind, CombatMark, CombatSegment } from "./combatTypes.js";

export type CombatNature = "human" | "beast" | "bird";
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

function asRecord(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

function pick<T>(variants: T[], seed: number): T {
  return variants[Math.abs(seed) % variants.length]!;
}

export function inferNature(name: string, id?: string): CombatNature {
  const s = `${id ?? ""}${name}`;
  if (/鸟|鹰|雕|雀|鸦|鹤|雁/.test(s)) return "bird";
  if (/狗|犬|狼|鼠|虎|豹|熊|蛇|兽|猫|狐|猪|牛|马/.test(s)) return "beast";
  return "human";
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

function tierOf(actor: string | undefined, options?: BattleLineOptions): CombatTier {
  return combatTier(options?.combatantOf?.(actor)?.stats);
}

function maxQiOf(actor: string | undefined, options?: BattleLineOptions): number | undefined {
  return options?.combatantOf?.(actor)?.maxQi;
}

/** 击间闲笔：盯破绽、移步、兽性低伏——对标 xkx guard_msg，句子原创。 */
function atmosphereLine(
  event: ServerCombatEvent,
  actorLabel: string,
  foeLabel: string,
  actorNature: CombatNature,
  actorTier: CombatTier,
): CombatLine {
  const seed = event.seq;
  if (actorNature === "beast") {
    return assemble(
      event.seq,
      "normal",
      pick(
        [
          [actorLabel, "伏低身躯，喉咙里滚着低吼，眼睛死死", kw("盯着", "tense"), foeLabel, "。"],
          [actorLabel, "绕着", foeLabel, "转了半圈，爪子刨土，随时可能再扑。"],
          [actorLabel, "呲着牙退了半步，却丝毫没有放松", kw("盯视", "tense"), "。"],
        ],
        seed,
      ),
    );
  }
  if (actorNature === "bird") {
    return assemble(
      event.seq,
      "normal",
      pick(
        [
          [actorLabel, "振翅掠过半空，锐眼", kw("盯着", "tense"), foeLabel, "的头顶。"],
          [actorLabel, "尖鸣一声，在空中盘旋，寻找下扑的时机。"],
        ],
        seed,
      ),
    );
  }
  if (actorTier === "high") {
    return assemble(
      event.seq,
      "normal",
      pick(
        [
          [actorLabel, "气机牵引之间，已看清", foeLabel, "肩头那一瞬的", kw("破绽", "tense"), "。"],
          [actorLabel, "缓步半寸，像把整片杀机都压进脚底——伺机而动。"],
          [actorLabel, "目不转睛", kw("盯着", "tense"), foeLabel, "，呼吸却稳得像没在打。"],
        ],
        seed,
      ),
    );
  }
  if (actorTier === "mid") {
    return assemble(
      event.seq,
      "normal",
      pick(
        [
          [actorLabel, "慢慢移动脚步，想找出", foeLabel, "的", kw("破绽", "tense"), "。"],
          [actorLabel, "正", kw("盯着", "tense"), foeLabel, "一举一动，随时准备递招。"],
          [actorLabel, "侧身半寸，鞋底碾过碎石，杀机未散。"],
        ],
        seed,
      ),
    );
  }
  return assemble(
    event.seq,
    "normal",
    pick(
      [
        [actorLabel, "咽了口唾沫，脚步乱挪，却还死死", kw("盯着", "tense"), foeLabel, "。"],
        [actorLabel, "喘着粗气，抬手护住前胸，不敢移开视线。"],
        [actorLabel, "左右挪了两步，像在找一个敢下手的空档。"],
      ],
      seed,
    ),
  );
}

function beastHurtYou(event: ServerCombatEvent, actorName: string, band: DamageBand): CombatLine {
  const seed = event.seq;
  if (band === "light") {
    return assemble(
      event.seq,
      "hurt",
      pick(
        [
          [actorName, "扑近，牙关", kw("咬中", "hurt"), "衣角——只蹭破一点皮肉。"],
          [actorName, "爪子", kw("抓过", "hurt"), "你小腿，火辣辣一道白印。"],
          [actorName, "低吼着蹭上来，口鼻的热气喷在腕上，疼得不重。"],
        ],
        seed,
      ),
    );
  }
  if (band === "mid") {
    return assemble(
      event.seq,
      "hurt",
      pick(
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
        ],
        seed,
      ),
    );
  }
  return assemble(
    event.seq,
    "hurt",
    pick(
      [
        [actorName, "狂性大发，连皮带肉", kw("撕咬", "hurt"), "一口——你眼前发黑，铁锈味涌上喉头。"],
        [actorName, "扑得又狠又快，一口", kw("咬住", "hurt"), "你肩头不放，血气四散。"],
        ["惨嚎般的低吼里，", actorName, "已", kw("咬下", "hurt"), "血肉模糊的一块。"],
      ],
      seed,
    ),
  );
}

function birdHurtYou(event: ServerCombatEvent, actorName: string, band: DamageBand): CombatLine {
  const seed = event.seq;
  if (band === "light") {
    return assemble(
      event.seq,
      "hurt",
      pick(
        [
          [actorName, "斜掠而过，喙尖", kw("啄中", "hurt"), "你耳廓——火辣辣的。"],
          [actorName, "翅风扫过颊边，爪子", kw("刮破", "hurt"), "一层皮。"],
        ],
        seed,
      ),
    );
  }
  if (band === "mid") {
    return assemble(
      event.seq,
      "hurt",
      pick(
        [
          [actorName, "一个猛", kw("扑", "hurt"), "，利爪", kw("抠进", "hurt"), "你肩头。"],
          [actorName, "锐鸣中喙", kw("啄中", "hurt"), "你腕骨，酸麻直窜肘弯。"],
        ],
        seed,
      ),
    );
  }
  return assemble(
    event.seq,
    "hurt",
    pick(
      [
        [actorName, "从天而降，爪喙齐至，你头顶一凉，血顺着额角淌。"],
        [actorName, "连", kw("啄", "hurt"), "带", kw("抓", "hurt"), "，你几乎抬不起手。"],
      ],
      seed,
    ),
  );
}

function humanHurtYou(
  event: ServerCombatEvent,
  actorName: string,
  tier: CombatTier,
  band: DamageBand,
): CombatLine {
  const seed = event.seq;
  if (tier === "high") {
    if (band === "light") {
      return assemble(event.seq, "hurt", [
        actorName,
        "只递了半式，指风已",
        kw("点中", "hurt"),
        "你脉门——内息乱了片刻。",
      ]);
    }
    if (band === "mid") {
      return assemble(
        event.seq,
        "hurt",
        pick(
          [
            [actorName, "这一式如影随形。力透脊背，你退了两步，口中已泛起铁锈味。"],
            [actorName, "招势未尽，杀机先至——你肩头", kw("中招", "hurt"), "，真气散了半寸。"],
          ],
          seed,
        ),
      );
    }
    return assemble(
      event.seq,
      "hurt",
      pick(
        [
          ["气机一压。", actorName, "这一击", kw("贯中", "hurt"), "胸臆，你气血倒涌，眼前发黑。"],
          [actorName, "招式过处，天地似静——你却已", kw("中了", "hurt"), "实打，吐出一口血。"],
        ],
        seed,
      ),
    );
  }
  if (tier === "mid") {
    if (band === "light") {
      return assemble(event.seq, "hurt", [
        actorName,
        "一记擦过肋下，",
        kw("蹭破", "hurt"),
        "皮肉，疼得人一缩。",
      ]);
    }
    if (band === "mid") {
      return assemble(
        event.seq,
        "hurt",
        pick(
          [
            [actorName, "这一下又狠又快——你退得半步，却已", kw("吃了", "hurt"), "实打。"],
            ["避无可避。", actorName, "的力道", kw("撞上", "hurt"), "肩背，你牙关一紧。"],
          ],
          seed,
        ),
      );
    }
    return assemble(event.seq, "hurt", [
      actorName,
      "重重一击",
      kw("命中", "hurt"),
      "，你连退数步，差点栽倒。",
    ]);
  }
  // low
  if (band === "light") {
    return assemble(
      event.seq,
      "hurt",
      pick(
        [
          [actorName, "胡乱一抡，", kw("打中", "hurt"), "你胳膊——比拍苍蝇重些。"],
          [actorName, "拳头歪斜落下，你颊边", kw("挨了一记", "hurt"), "，火辣辣的。"],
        ],
        seed,
      ),
    );
  }
  if (band === "mid") {
    return assemble(event.seq, "hurt", [
      actorName,
      "凭着蛮力",
      kw("砸中", "hurt"),
      "你胸口，闷哼一声，脚步乱了。",
    ]);
  }
  return assemble(event.seq, "hurt", [
    actorName,
    "不知哪来的狠劲，一记",
    kw("结结实实打中", "hurt"),
    "——你眼冒金星。",
  ]);
}

function youHitFoe(
  event: ServerCombatEvent,
  hitTarget: string,
  foeNature: CombatNature,
  yourTier: CombatTier,
  band: DamageBand,
): CombatLine {
  const seed = event.seq;
  if (foeNature === "beast" || foeNature === "bird") {
    const animalVerb =
      foeNature === "bird"
        ? pick(
            [
              [kw("啄中", "hit"), "翅根"],
              [kw("扫中", "hit"), "羽翼"],
            ],
            seed,
          )
        : pick(
            [
              [kw("砸中", "hit"), "肩胛"],
              [kw("踢中", "hit"), "肋侧"],
              [kw("劈中", "hit"), "后颈"],
            ],
            seed,
          );
    if (band === "light") {
      return assemble(event.seq, "damage", [
        "你抬手一记，",
        ...animalVerb,
        "——",
        hitTarget,
        "吃痛一缩，却没退远。",
      ]);
    }
    if (band === "mid") {
      return assemble(
        event.seq,
        "damage",
        pick(
          [
            ["力由脊发。你这一击", kw("命中", "hit"), hitTarget, "——它闷嚎一声，爪子乱刨。"],
            ["没有花哨。你只递出一记干脆的着子，", hitTarget, "已", kw("中了", "hit"), "实打。"],
          ],
          seed,
        ),
      );
    }
    return assemble(event.seq, "damage", [
      "你这一下又准又狠，",
      hitTarget,
      kw("哀嚎", "hit"),
      "着踉跄后退，涎水混着血。",
    ]);
  }

  if (yourTier === "high") {
    if (band === "light") {
      return assemble(event.seq, "damage", [
        "你指风轻点，已",
        kw("点中", "hit"),
        hitTarget,
        "脉门——他脸色微变。",
      ]);
    }
    if (band === "mid") {
      return assemble(event.seq, "damage", [
        "招势过处，衣角翻飞。",
        hitTarget,
        "胸前一沉，被你",
        kw("贯中", "hit"),
        "，气息散了半寸。",
      ]);
    }
    return assemble(event.seq, "damage", [
      "气机一转，你这一式",
      kw("命中", "hit"),
      hitTarget,
      "——他连退数步，鲜血狂喷。",
    ]);
  }
  if (yourTier === "mid") {
    if (band === "light") {
      return assemble(event.seq, "damage", [
        "你一记擦过",
        hitTarget,
        "肩头，",
        kw("划出", "hit"),
        "一道细长血痕。",
      ]);
    }
    if (band === "mid") {
      return assemble(
        event.seq,
        "damage",
        pick(
          [
            ["力由脊发。你这一击落在", hitTarget, "身上——他闷哼一声，脚步乱了。"],
            [
              "没有花哨。你只递出一记干脆的着子，",
              hitTarget,
              "肩头已",
              kw("吃了", "hit"),
              "实打。",
            ],
          ],
          seed,
        ),
      );
    }
    return assemble(event.seq, "damage", [
      "你这一击",
      kw("结结实实命中", "hit"),
      "，",
      hitTarget,
      "退了好几步，差点摔倒。",
    ]);
  }
  // low
  if (band === "light") {
    return assemble(event.seq, "damage", [
      "你胡乱挥出一记，总算",
      kw("打中", "hit"),
      hitTarget,
      "胳膊——他骂了一声。",
    ]);
  }
  if (band === "mid") {
    return assemble(event.seq, "damage", [
      "你凭着一口气",
      kw("砸中", "hit"),
      hitTarget,
      "胸口，他闷哼着退开。",
    ]);
  }
  return assemble(event.seq, "damage", [
    "你不知哪来的狠劲，一记",
    kw("打中", "hit"),
    hitTarget,
    "——他像一捆稻草般晃了晃。",
  ]);
}

function dodgeLine(
  event: ServerCombatEvent,
  actorName: string,
  hitTarget: string,
  attackerNature: CombatNature,
  fromPlayer: boolean,
): CombatLine {
  const seed = event.seq;
  if (attackerNature === "beast") {
    return assemble(
      event.seq,
      "dodge",
      pick(
        [
          [hitTarget, "侧身半寸。", actorName, "这一", kw("扑", "dodge"), "落空，只带起一阵土腥。"],
          [
            "差一点。",
            actorName,
            "牙关咔嚓合上——",
            hitTarget,
            "已",
            kw("闪避", "dodge"),
            "开，尘土在脚边打了个旋。",
          ],
          [hitTarget, "就地一滚，", actorName, "的利爪", kw("抓空", "dodge"), "，刨起一片碎石。"],
        ],
        seed,
      ),
    );
  }
  if (attackerNature === "bird") {
    return assemble(event.seq, "dodge", [
      hitTarget,
      "低头一矮，",
      actorName,
      "这一",
      kw("扑啄", "dodge"),
      "擦过发梢。",
    ]);
  }
  return assemble(
    event.seq,
    "dodge",
    pick(
      [
        [hitTarget, "侧身半寸。招式擦过衣角，只带起一阵空风——", kw("闪避", "dodge"), "开来。"],
        [
          "差一点。",
          actorName,
          "这一招落空，",
          hitTarget,
          "已",
          kw("躲开", "dodge"),
          "，尘土在脚边打了个旋。",
        ],
        ["没有人看清那一瞬——", hitTarget, "已让开，招式", kw("扑了个空", "dodge"), "。"],
        fromPlayer
          ? [hitTarget, "脚步一滑，竟", kw("躲开", "dodge"), "了你这一记。"]
          : ["你脚步一滑，竟", kw("躲开", "dodge"), "了", actorName, "这一记。"],
      ],
      seed,
    ),
  );
}

function parryLine(event: ServerCombatEvent, hitTarget: string): CombatLine {
  const seed = event.seq;
  return assemble(
    event.seq,
    "parry",
    pick(
      [
        [hitTarget, "横开架势，硬生生把这一击", kw("招架", "parry"), "住。虎口发麻，人却没退。"],
        ["金石相交，一串短响。", hitTarget, kw("架住了", "parry"), "，腕骨隐隐发酸。"],
        [hitTarget, "以肘硬接，", kw("挡下", "parry"), "这记杀招，肩头却震得发麻。"],
      ],
      seed,
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
  const actorTier = tierOf(event.actor, options);
  const yourTier = tierOf("a", options);
  const targetMaxQi = maxQiOf(targetId ?? (fromPlayer ? undefined : "a"), options);
  const band = damageBand(damage, targetMaxQi);

  switch (event.type) {
    case "battle_start": {
      const primaryNature = natureOf("b0", enemyName, options);
      if (foeCount > 1 || foeNames.length > 1) {
        const list = foeNames.length > 0 ? foeNames.join("、") : "数人";
        if (primaryNature === "beast") {
          return assemble(
            event.seq,
            "start",
            pick(
              [
                ["腥风先至。", list, "已将退路堵死——低吼连成一片。"],
                [list, "围上来，涎水滴在尘土里。这一场，注定要应付群畜。"],
              ],
              event.seq,
            ),
          );
        }
        return assemble(
          event.seq,
          "start",
          pick(
            [
              ["风忽然静了。", list, "已将退路堵死——这一场，注定要一个人应付多方。"],
              [list, "围上来。杀意像潮水，一寸寸漫过脚面。"],
            ],
            event.seq,
          ),
        );
      }
      if (primaryNature === "beast") {
        return assemble(
          event.seq,
          "start",
          pick(
            [
              [enemyName, "呲着牙横在眼前。四下无声，只余它喉咙里的低吼。"],
              ["与", enemyName, "对上了。兽瞳发绿，扑杀之意先至。"],
            ],
            event.seq,
          ),
        );
      }
      if (primaryNature === "bird") {
        return assemble(event.seq, "start", [enemyName, "盘旋头顶。锐鸣一声，风都尖了。"]);
      }
      return assemble(
        event.seq,
        "start",
        pick(
          [
            [enemyName, "横在眼前。四下无声，只余彼此的呼吸。"],
            ["与", enemyName, "对上了。刀未出鞘，杀机先至。"],
          ],
          event.seq,
        ),
      );
    }
    case "damage":
      if (fromPlayer) {
        return youHitFoe(event, hitTarget, targetNature, yourTier, band);
      }
      if (actorNature === "beast") return beastHurtYou(event, actorName, band);
      if (actorNature === "bird") return birdHurtYou(event, actorName, band);
      return humanHurtYou(event, actorName, actorTier, band);
    case "parry":
      return parryLine(event, hitTarget);
    case "miss":
    case "dodge":
      return dodgeLine(event, actorName, hitTarget, actorNature, fromPlayer);
    case "recover":
      return assemble(
        event.seq,
        "recover",
        pick(
          [
            [actorName, "沉息归元。浊气下沉，清气上升，肩背松了半分。"],
            ["丹田一点暖意散开。", actorName, "稳住了阵脚，呼吸渐沉。"],
          ],
          event.seq,
        ),
      );
    case "perform":
      return assemble(
        event.seq,
        "perform",
        performName
          ? pick(
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
              ],
              event.seq,
            )
          : pick(
              [
                ["气机一转，绝招已出。短促，凌厉，不留余地。"],
                ["这一式来得又急又准——对手心神最松的一瞬，你已递到了。"],
              ],
              event.seq,
            ),
      );
    case "perform_failed":
      return assemble(
        event.seq,
        "danger",
        pick(
          [
            [actorName, "气息未继，这一式终究散在半途。"],
            ["真气一滞。", actorName, "想发的那一招，只余半截余势。"],
          ],
          event.seq,
        ),
      );
    case "flee":
      return assemble(
        event.seq,
        "danger",
        data.success === true
          ? pick(
              [
                [actorName, "虚晃一步，身形已没入烟尘。"],
                ["退路虽窄，", actorName, "还是从杀机缝里钻了出去。"],
              ],
              event.seq,
            )
          : pick(
              [
                [actorName, "想退，对手却缠上来，退路被堵死了。"],
                ["抽身不及。", actorName, "刚挪半步，便被杀气压了回去。"],
              ],
              event.seq,
            ),
      );
    case "foe_down": {
      const fallen = typeof data.name === "string" ? data.name : actorName;
      const fallenNature = natureOf(event.actor, fallen, options);
      if (fallenNature === "beast") {
        return assemble(
          event.seq,
          "down",
          pick(
            [
              [fallen, "腿下一软，栽进尘土——喉咙里的低吼断了。"],
              ["风过处，", fallen, "已伏。爪子抽搐两下，便静了。"],
            ],
            event.seq,
          ),
        );
      }
      return assemble(
        event.seq,
        "down",
        pick(
          [
            [fallen, "膝下一软，栽进尘土——一时起不来了。"],
            ["风过处，", fallen, "已伏。余劲还在，人却静了。"],
          ],
          event.seq,
        ),
      );
    }
    case "victory":
      return assemble(
        event.seq,
        "victory",
        pick(
          [
            ["胜负已分。余劲散在风里，像一场未写完的句号。"],
            ["尘埃落定。四下忽然静得能听见自己的心跳。"],
          ],
          event.seq,
        ),
      );
    case "reward":
      return assemble(
        event.seq,
        "victory",
        pick([["这一程所得，已收入行囊。"], ["战利入囊。江湖路远，先带走眼前这点。"]], event.seq),
      );
    case "quest_progress":
      return assemble(
        event.seq,
        "normal",
        pick([["手头的请托，也向前走了一步。"], ["这一战之后，肩上的差事轻了半分。"]], event.seq),
      );
    case "draw":
      return assemble(
        event.seq,
        "danger",
        pick([["两下分开，谁也没有再追。"], ["未分胜负。风里只余各自的喘息。"]], event.seq),
      );
    case "turn_start": {
      const turn = typeof data.turn === "number" ? data.turn : event.seq;
      // 约半数回合注入闲笔，避免每拍都刷屏
      if (turn % 2 === 1) return null;
      // 交替写「你盯对方」与「对方盯你」
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
