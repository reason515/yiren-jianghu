import type { JSX } from "react";
import { Sheet } from "./base/Sheet.js";
import { Chip } from "./base/Chip.js";
import type { SceneItem, SceneNpc } from "../lib/sceneTypes.js";

/** 人物/物品详情（动作从能力长出：商贩→交易、师父→拜师、任务→请托、战斗→较量、物品→拾取）。 */
export interface EntitySheetProps {
  open: boolean;
  entity: SceneNpc | SceneItem;
  onAction: (command: string) => void;
  onClose: () => void;
}

interface ActionDef {
  command: string;
  label: string;
  variant: "action" | "danger";
}

const ITEM_KINDS = new Set(["weapon", "armor", "drug", "food", "misc"]);

function actionsFor(entity: SceneNpc | SceneItem): ActionDef[] {
  if (ITEM_KINDS.has(entity.kind)) {
    return [{ command: `take ${entity.id}`, label: "拾取", variant: "action" }];
  }
  const npc = entity as SceneNpc;
  switch (npc.kind) {
    case "vendor":
      return [
        { command: `talk ${npc.id}`, label: "交谈", variant: "action" },
        { command: `trade ${npc.id}`, label: "交易", variant: "action" },
      ];
    case "apprentice_master":
      return [
        { command: `talk ${npc.id}`, label: "交谈", variant: "action" },
        { command: `apprentice ${npc.id}`, label: "拜师", variant: "action" },
      ];
    case "quest_giver":
      return [
        { command: `talk ${npc.id}`, label: "交谈", variant: "action" },
        { command: `quest ${npc.id}`, label: "请托", variant: "action" },
      ];
    case "battle":
      return [{ command: `fight ${npc.id}`, label: "较量", variant: "danger" }];
    default:
      return [{ command: `talk ${npc.id}`, label: "交谈", variant: "action" }];
  }
}

export function EntitySheet({
  open,
  entity,
  onAction,
  onClose,
}: EntitySheetProps): JSX.Element | null {
  return (
    <Sheet open={open} title={entity.name} onClose={onClose}>
      <div className="chips" data-testid="entity-actions">
        {actionsFor(entity).map((a) => (
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
