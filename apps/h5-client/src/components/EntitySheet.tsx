import type { JSX } from "react";
import { Sheet } from "./base/Sheet.js";
import { Chip } from "./base/Chip.js";
import type { SceneItem, SceneNpc } from "../lib/sceneTypes.js";

/** 人物/物品详情（动作从能力长出：商贩→交易、教头→请教、掌门→拜师/请教…）。 */
export interface EntitySheetProps {
  open: boolean;
  entity: SceneNpc | SceneItem;
  /** 角色当前门派 id（DC-039：决定拜师/请教按钮）。 */
  sectId?: string | null;
  onAction: (command: string) => void;
  onClose: () => void;
}

interface ActionDef {
  command: string;
  label: string;
  variant: "action" | "danger";
}

const ITEM_KINDS = new Set(["weapon", "armor", "drug", "food", "misc"]);

function actionsFor(entity: SceneNpc | SceneItem, sectId?: string | null): ActionDef[] {
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
      if (!sectId) {
        actions.push({ command: `apprentice ${npc.id}`, label: "拜师", variant: "action" });
      } else if (!npc.sectId || npc.sectId === sectId) {
        actions.push({ command: `teach ${npc.id}`, label: "请教", variant: "action" });
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
  onAction,
  onClose,
}: EntitySheetProps): JSX.Element | null {
  return (
    <Sheet open={open} title={entity.name} onClose={onClose}>
      <div className="chips" data-testid="entity-actions">
        {actionsFor(entity, sectId).map((a) => (
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
