import type { PerformRowView } from "./characterTypes.js";

/** 场外运功展示项（DC-052）。 */
export interface FieldExertOption {
  id: string;
  name: string;
  skillId: string;
  kind: "heal" | "cure" | "heal_jing";
  cost: { qi: number; jing: number; neili: number };
}

const KIND_LABEL: Record<FieldExertOption["kind"], string> = {
  heal: "回气",
  cure: "疗伤",
  heal_jing: "回精",
};

export function fieldExertKindLabel(kind: FieldExertOption["kind"]): string {
  return KIND_LABEL[kind];
}

/** 从角色/mastery 绝招列表筛出场外可运功项。 */
export function toFieldExertOptions(performs: PerformRowView[] | undefined): FieldExertOption[] {
  if (!performs?.length) return [];
  const out: FieldExertOption[] = [];
  for (const p of performs) {
    const kind = p.fieldKind ?? null;
    if (!kind) continue;
    out.push({
      id: p.id,
      name: p.name,
      skillId: p.skillId,
      kind,
      cost: p.cost ?? { qi: 0, jing: 0, neili: 0 },
    });
  }
  return out;
}

export function formatExertCost(cost: { qi: number; jing: number; neili: number }): string {
  const parts: string[] = [];
  if (cost.neili > 0) parts.push(`内力 ${cost.neili}`);
  if (cost.jing > 0) parts.push(`精 ${cost.jing}`);
  if (cost.qi > 0) parts.push(`气 ${cost.qi}`);
  return parts.length > 0 ? parts.join(" · ") : "无额外消耗";
}
