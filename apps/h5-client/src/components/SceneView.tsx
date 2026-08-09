import { useState, type JSX } from "react";
import { Chip } from "./base/Chip.js";
import { ExitPad } from "./ExitPad.js";
import { ArtPlaceholder } from "./ArtPlaceholder.js";
import { JournalFeed, type JournalEntry } from "./JournalFeed.js";
import type { SceneNpc, SceneRoom } from "../lib/sceneTypes.js";

/**
 * 场景页（mobile-ui：场景叙事优先 → 见闻动态流 → 此刻可往 → 交互 Tab；动作从世界中长出）。
 * V2.10：场景描述（静态所见）与见闻（互动后的动态记录）分离——描述留在标题下，
 * 见闻由 JournalFeed 承接（交谈/交易/拾取/战斗等追加，可展开滚动翻历史）；
 * 人物/物品/动作改为页签 + 内容面板形式。
 */
export interface SceneViewProps {
  room: SceneRoom;
  journal: JournalEntry[];
  /** 见闻一行展示完毕（打字结束），供串行队列放出下一句。 */
  onJournalSettled?: (id: number) => void;
  onGo: (dir: string) => void;
  onSelectNpc: (npc: SceneNpc) => void;
  onSelectItem: (itemId: string) => void;
  onAction: (command: string) => void;
}

export function SceneView({
  room,
  journal,
  onJournalSettled,
  onGo,
  onSelectNpc,
  onSelectItem,
  onAction,
}: SceneViewProps): JSX.Element {
  const [tab, setTab] = useState<"npcs" | "items" | "actions">("npcs");
  const hasNpcs = room.npcs.length > 0;
  const hasItems = room.items.length > 0;
  const hasActions = room.actions.length > 0;

  return (
    <div className="scene" data-testid="scene">
      <div className="scene-head">
        <ArtPlaceholder text={room.name} tone="jade" size="sm" />
        <h1 className="scene-title">{room.name}</h1>
      </div>
      <p className="scene-desc">{room.longDesc || room.shortDesc}</p>
      {room.canSleep && <span className="scene-hint">此地可歇脚入眠。</span>}

      <JournalFeed entries={journal} onEntrySettled={onJournalSettled} />

      <section className="scene-block">
        <div className="scene-block-head">
          <h2>此刻可往</h2>
        </div>
        <ExitPad exits={room.exits} roomName={room.name} onGo={onGo} />
      </section>

      {(hasNpcs || hasItems || hasActions) && (
        <section className="scene-block">
          <div className="scene-tabs" role="tablist" aria-label="场景交互">
            {hasNpcs && (
              <button
                type="button"
                role="tab"
                aria-selected={tab === "npcs"}
                className={tab === "npcs" ? "on" : ""}
                onClick={() => setTab("npcs")}
              >
                人物
                <span className="scene-tab-count">{room.npcs.length}</span>
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
                物品
                <span className="scene-tab-count">{room.items.length}</span>
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
                动作
                <span className="scene-tab-count">{room.actions.length}</span>
              </button>
            )}
          </div>
          <div className="tab-panel">
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
