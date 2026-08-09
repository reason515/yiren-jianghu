/** 由人物簿快照拼装的仪容短述（对齐 xkx look me：人称「你」+ 武功水平 + 衣着兵器；非 MUD 命令）。 */
export function buildCharacterLook(character: {
  name: string;
  gender: "male" | "female";
  skills: Array<{ level: number }>;
  equipment: Array<{ slot: "weapon" | "armor"; item?: { name: string } }>;
}): string[] {
  const genderWord = character.gender === "male" ? "男子" : "女子";
  const lines: string[] = [`你是一名${genderWord}，江湖人称「${character.name}」。`];

  const maxLevel = character.skills.reduce((best, skill) => Math.max(best, skill.level), 0);
  if (maxLevel <= 0) {
    lines.push("武功尚浅，尚未入门。");
  } else if (maxLevel <= 20) {
    lines.push("武功初窥门径，招式仍显生疏。");
  } else if (maxLevel <= 50) {
    lines.push("已有几分根基，身手渐稳。");
  } else if (maxLevel <= 100) {
    lines.push("功力渐成，行走江湖不至于慌张。");
  } else {
    lines.push("武学已入堂奥，锋芒隐于骨中。");
  }

  const armor = character.equipment.find((slot) => slot.slot === "armor")?.item;
  const weapon = character.equipment.find((slot) => slot.slot === "weapon")?.item;
  lines.push(armor ? `身上穿着${armor.name}。` : "周身未着衣甲，显得单薄。");
  lines.push(weapon ? `腰间悬着${weapon.name}。` : "手里空空，未佩兵器。");

  return lines;
}
