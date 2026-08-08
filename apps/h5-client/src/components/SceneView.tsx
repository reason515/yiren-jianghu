import { useState, type JSX } from "react";
import { Chip } from "./base/Chip.js";
import { ExitPad } from "./ExitPad.js";
import { ArtPlaceholder } from "./ArtPlaceholder.js";
import { PHASE_LABEL, type QuestView } from "../lib/questTypes.js";
import type { SceneNpc, SceneRoom } from "../lib/sceneTypes.js";

/**
 * 场景页（mobile-ui：场景叙事优先 → 此刻可往 → 见闻 Tab；动作从世界中长出）。
 */
export interface SceneViewProps {
  room: SceneRoom;
  quest?: QuestView | null;
  onOpenQuests?: () => void;
  onGo: (dir: string) => void;
  onSelectNpc: (npc: SceneNpc) => void;
  onSelectItem: (itemId: string) => void;
  onAction: (command: string) => void;
}

export function SceneView({
  room,
  quest,
  onOpenQuests,
  onGo,
  onSelectNpc,
  onSelectItem,
  onAction,
}: SceneViewProps): JSX.Element {
  const [tab, setTab] = useState<"npcs" | "items" | "actions">("npcs");
  const pendingPhase =
    quest?.state === "accepted" ? (quest.phases.find((p) => !p.done) ?? null) : null;
  const hasNpcs = room.npcs.length > 0;
  const hasItems = room.items.length > 0;
  const hasActions = room.actions.length > 0;

  return (
    <div className="scene" data-testid="scene">
      <div className="scene-head">
        <ArtPlaceholder text={room.name} tone="jade" size="sm" />
        <h1 className="scene-title">{room.name}</h1>
      </div>
      <div className="scene-journal" aria-hidden="true">
        见闻
      </div>
      <p className="scene-desc">{room.longDesc || room.shortDesc}</p>
      {pendingPhase && (
        <section className="scene-block scene-quest">
          <div className="scene-block-head">
            <h2>当前要事</h2>
          </div>
          <div className="quest-card">
            <div className="quest-card-info">
              <strong>{quest!.name}</strong>
              <span>
                {PHASE_LABEL[pendingPhase.type]} {pendingPhase.targetName}
              </span>
            </div>
            {onOpenQuests && <Chip label="查看" variant="action" onClick={onOpenQuests} />}
          </div>
        </section>
      )}

      {room.canSleep && <span className="scene-hint">此地可歇脚入眠。</span>}

      <section className="scene-block">
        <div className="scene-block-head">
          <h2>此刻可往</h2>
        </div>
        <ExitPad exits={room.exits} roomName={room.name} onGo={onGo} />
      </section>

      {(hasNpcs || hasItems || hasActions) && (
        <section className="scene-block">
          <div className="scene-tabs" role="tablist" aria-label="此地">
            {hasNpcs && (
              <button
                type="button"
                role="tab"
                aria-selected={tab === "npcs"}
                className={tab === "npcs" ? "on" : ""}
                onClick={() => setTab("npcs")}
              >
                人物{room.npcs.length}
              </button>
            )}
            {hasItems && (
              <button
                type="button"
                role="tab"
                aria-selected={tab === "items"}
                className={tab === "items" ? "on" : ""}
                onClick={() => setTab("items")}
              >
                物品{room.items.length}
              </button>
            )}
            {hasActions && (
              <button
                type="button"
                role="tab"
                aria-selected={tab === "actions"}
                className={tab === "actions" ? "on" : ""}
                onClick={() => setTab("actions")}
              >
                动作{room.actions.length}
              </button>
            )}
          </div>
          <div className="chips">
            {tab === "npcs" &&
              room.npcs.map((n) => (
                <Chip key={n.id} label={n.name} variant="npc" onClick={() => onSelectNpc(n)} />
              ))}
            {tab === "items" &&
              room.items.map((it) => (
                <Chip
                  key={it.id}
                  label={it.name}
                  variant="item"
                  onClick={() => onSelectItem(it.id)}
                />
              ))}
            {tab === "actions" &&
              room.actions.map((a) => (
                <Chip
                  key={a.command}
                  label={a.label}
                  variant="action"
                  onClick={() => onAction(a.command)}
                />
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
