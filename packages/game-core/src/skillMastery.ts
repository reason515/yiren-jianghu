/**
 * 武功/杂学境界标签（DC-057）。
 * 机制借鉴 pkuxkx `cmds/skill/skills.c`：武学 grade=level/30，知识 grade=level/50；
 * 文案为江湖通用称谓（ANSI 色已剥离），非原创句。不做内功「重楼」。
 */

/** 武学境界（50 档，grade = floor(level / 30)）。 */
export const SKILL_MASTERY_LABELS = [
  "不堪一击",
  "毫不足虑",
  "不足挂齿",
  "初学乍练",
  "勉勉强强",
  "初窥门径",
  "初出茅庐",
  "略知一二",
  "普普通通",
  "平平淡淡",
  "平淡无奇",
  "粗通皮毛",
  "半生不熟",
  "马马虎虎",
  "略有小成",
  "已有小成",
  "鹤立鸡群",
  "驾轻就熟",
  "青出于蓝",
  "融会贯通",
  "心领神会",
  "炉火纯青",
  "了然于胸",
  "略有大成",
  "已有大成",
  "豁然贯通",
  "出类拔萃",
  "无可匹敌",
  "技冠群雄",
  "神乎其技",
  "出神入化",
  "非同凡响",
  "傲视群雄",
  "登峰造极",
  "无与伦比",
  "所向披靡",
  "一代宗师",
  "精深奥妙",
  "神功盖世",
  "举世无双",
  "惊世骇俗",
  "撼天动地",
  "震古铄今",
  "超凡入圣",
  "威镇寰宇",
  "空前绝后",
  "天人合一",
  "深藏不露",
  "深不可测",
  "返璞归真",
] as const;

/** 知识/杂学境界（16 档，grade = floor(level / 50)）。 */
export const KNOWLEDGE_MASTERY_LABELS = [
  "新学乍用",
  "初窥门径",
  "略知一二",
  "半生不熟",
  "马马虎虎",
  "已有小成",
  "融会贯通",
  "心领神会",
  "了然于胸",
  "已有大成",
  "非同凡响",
  "举世无双",
  "震古铄今",
  "无与伦比",
  "超凡入圣",
  "深不可测",
] as const;

export type SkillMasteryKind = "martial" | "knowledge";

export interface SkillMastery {
  /** 境界短标签（无 ANSI）。 */
  label: string;
  /** 档位下标（从 0）。 */
  grade: number;
  /** 映射 UI `--mastery-1..6`。 */
  band: 1 | 2 | 3 | 4 | 5 | 6;
}

function clampGrade(grade: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(grade, length - 1));
}

/** 将档位均分到 1..6，供现有精通色 token 着色。 */
export function masteryBand(grade: number, length: number): 1 | 2 | 3 | 4 | 5 | 6 {
  if (length <= 1) return 1;
  const step = Math.ceil(length / 6);
  const band = Math.floor(clampGrade(grade, length) / step) + 1;
  return Math.min(6, Math.max(1, band)) as 1 | 2 | 3 | 4 | 5 | 6;
}

/**
 * @param level 技能原级
 * @param kind martial=武学（/30）；knowledge=杂学（/50）
 */
export function skillMastery(level: number, kind: SkillMasteryKind = "martial"): SkillMastery {
  const labels = kind === "knowledge" ? KNOWLEDGE_MASTERY_LABELS : SKILL_MASTERY_LABELS;
  const divisor = kind === "knowledge" ? 50 : 30;
  const safeLevel = Math.max(0, Math.floor(level));
  const grade = clampGrade(Math.floor(safeLevel / divisor), labels.length);
  return {
    label: labels[grade]!,
    grade,
    band: masteryBand(grade, labels.length),
  };
}
