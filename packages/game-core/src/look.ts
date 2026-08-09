/**
 * 仪容 / 观察短述拼装（对齐 xkx look：外形 + 武功水平 + 衣着兵器）。
 * 纯函数，供服务端观察与客户端人物簿复用同一套境界阶位。
 */

export type LookVoice = "self" | "other";

export type ObserveGear = {
  kind: "weapon" | "armor";
  name: string;
};

/** 按最高武学等级给出境界短句（数值不进文案）。 */
export function martialLevelLine(level: number, voice: LookVoice): string {
  if (level <= 0) {
    return voice === "self" ? "武功尚浅，尚未入门。" : "气息寻常，看不出深浅。";
  }
  if (level <= 20) return "武功初窥门径，招式仍显生疏。";
  if (level <= 50) return "已有几分根基，身手渐稳。";
  if (level <= 100) return "功力渐成，行走江湖不至于慌张。";
  return "武学已入堂奥，锋芒隐于骨中。";
}

/** 无有效武学等级时的观察侧补句（野兽/平民）。 */
function observeMartialFallback(kind: string): string {
  if (kind === "battle") {
    return "看去并无精深功夫，只凭一身蛮力与野性。";
  }
  return "气息寻常，看不出深浅。";
}

const DEFAULT_NPC_APPEARANCE = "此人风尘仆仆，看不出深浅，只觉一双眼睛格外沉静。";

/**
 * 观察 NPC：外形（内容包 description）+ 武功水平 + 衣着/兵器（有 equipment 才补）。
 * 无装备时不写「未着衣甲」，以免与外形文案里已写的装束打架。
 */
export function buildNpcObserveLines(input: {
  description: string;
  kind: string;
  skillLevels: number[];
  gear: ObserveGear[];
}): string[] {
  const appearance = input.description.trim() || DEFAULT_NPC_APPEARANCE;
  const lines: string[] = [appearance];

  const maxSkill = input.skillLevels.reduce((best, level) => Math.max(best, level), 0);
  if (maxSkill <= 0) {
    lines.push(observeMartialFallback(input.kind));
  } else {
    lines.push(martialLevelLine(maxSkill, "other"));
  }

  const armors = input.gear.filter((g) => g.kind === "armor");
  const weapons = input.gear.filter((g) => g.kind === "weapon");
  if (armors.length > 0) {
    lines.push(`身上穿着${armors.map((g) => g.name).join("、")}。`);
  }
  if (weapons.length > 0) {
    lines.push(`腰间悬着${weapons.map((g) => g.name).join("、")}。`);
  }

  return lines;
}
