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
      if (opts.masterNpcId && opts.masterNpcId === npc.id) {
        actions.push({ command: `teach ${npc.id}`, label: "请教", variant: "action" });
      }
      if (!opts.sectId && npc.acceptOutsiders) {
        actions.push({ command: `apprentice ${npc.id}`, label: "拜师", variant: "action" });
      }
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
  const isItem = ITEM_KINDS.has(entity.kind);
  const npc = isItem ? null : (entity as SceneNpc);
  const skills = npc?.skills ?? [];

  return (
    <Sheet open={open} title={entity.name} onClose={onClose}>
      {skills.length > 0 ? (
        <section className="entity-skills" aria-label="武功">
          <h4 className="entity-skills-title">武功</h4>
          <ul className="entity-skills-list">
            {skills.map((skill) => (
              <li key={skill.id}>
                <span>{skill.name}</span>
                <em>Lv {skill.level}</em>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
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
