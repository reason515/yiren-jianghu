import type { JSX } from "react";
import { Sheet } from "./base/Sheet.js";
import { Chip } from "./base/Chip.js";
import type { SceneItem, SceneNpc } from "../lib/sceneTypes.js";

/** 人物/物品详情（动作从能力长出：商贩→交易、教头→请教、师父→请教、可升师→拜师…）。 */
export interface EntitySheetProps {
  open: boolean;
  entity: SceneNpc | SceneItem;
  /** 角色当前门派 id。 */
  sectId?: string | null;
  /** 当前师父 NPC id（DC-040：仅向此人请教）。 */
  masterNpcId?: string | null;
  /** 当前师父辈分（用于判断可否改拜更高辈）。 */
  masterGeneration?: number | null;
  onAction: (command: string) => void;
  onClose: () => void;
}

interface ActionDef {
  command: string;
  label: string;
  variant: "action" | "danger";
}

const ITEM_KINDS = new Set(["weapon", "armor", "drug", "food", "misc"]);

function actionsFor(
  entity: SceneNpc | SceneItem,
  opts: {
    sectId?: string | null;
    masterNpcId?: string | null;
    masterGeneration?: number | null;
  },
): ActionDef[] {
  if (ITEM_KINDS.has(entity.kind)) {
    return [
      { command: `observe ${entity.id}`, label: "观察", variant: "action" },
      { command: `take ${entity.id}`, label: "拾取", variant: "action" },
    ];
  }
  const npc = entity as SceneNpc;
  const observe = { command: `observe ${npc.id}`, label: "观察", variant: "action" as const };
  switch (npc.kind) {
    case "vendor":
      return [
        observe,
        { command: `talk ${npc.id}`, label: "交谈", variant: "action" },
        { command: `trade ${npc.id}`, label: "交易", variant: "action" },
      ];
    case "tuition_teacher":
      return [
        observe,
        { command: `talk ${npc.id}`, label: "交谈", variant: "action" },
        { command: `teach ${npc.id}`, label: "请教", variant: "action" },
      ];
    case "apprentice_master": {
      const actions: ActionDef[] = [
        observe,
        { command: `talk ${npc.id}`, label: "交谈", variant: "action" },
      ];
      // 只向当前师父请教
      if (opts.masterNpcId && opts.masterNpcId === npc.id) {
        actions.push({ command: `teach ${npc.id}`, label: "请教", variant: "action" });
      }
      // 门外：仅入门师兄（acceptOutsiders）可拜
      if (!opts.sectId && npc.acceptOutsiders) {
        actions.push({ command: `apprentice ${npc.id}`, label: "拜师", variant: "action" });
      }
      // 同门改拜：目标辈分更尊（数字更小）
      if (
        opts.sectId &&
        npc.sectId === opts.sectId &&
        opts.masterNpcId &&
        opts.masterNpcId !== npc.id &&
        npc.generation != null &&
        opts.masterGeneration != null &&
        npc.generation < opts.masterGeneration
      ) {
        actions.push({ command: `apprentice ${npc.id}`, label: "拜师", variant: "action" });
      }
      return actions;
    }
    case "quest_giver":
      return [
        observe,
        { command: `talk ${npc.id}`, label: "交谈", variant: "action" },
        { command: `quest ${npc.id}`, label: "请托", variant: "action" },
      ];
    case "battle":
      return [observe, { command: `fight ${npc.id}`, label: "较量", variant: "danger" }];
    default:
      return [observe, { command: `talk ${npc.id}`, label: "交谈", variant: "action" }];
  }
}

export function EntitySheet({
  open,
  entity,
  sectId,
  masterNpcId,
  masterGeneration,
  onAction,
  onClose,
}: EntitySheetProps): JSX.Element | null {
  return (
    <Sheet open={open} title={entity.name} onClose={onClose}>
      <div className="chips" data-testid="entity-actions">
        {actionsFor(entity, { sectId, masterNpcId, masterGeneration }).map((a) => (
          <Chip
            key={a.command}
            label={a.label}
            variant={a.variant}
            onClick={() => onAction(a.command)}
          />
        ))}
      </div>
    </Sheet>
  );
}
