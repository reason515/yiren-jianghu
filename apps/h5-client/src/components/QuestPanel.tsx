import type { JSX } from "react";
import { Chip } from "./base/Chip.js";
import { KIND_LABEL, PHASE_LABEL, type QuestPanelData, type QuestView } from "../lib/questTypes.js";

/** 任务与主线面板（mobile-ui：动作从世界长出；任务简报/主线文本为内容包文案）。 */
export interface QuestPanelProps {
  data: QuestPanelData;
  onGoTo: (roomId: string) => void;
  onAccept: (questId: string) => void;
  onReport: (questId: string) => void;
}

export function QuestPanel({ data, onGoTo, onAccept, onReport }: QuestPanelProps): JSX.Element {
  return (
    <div className="quest-panel" data-testid="quest-panel">
      {data.story.length > 0 && (
        <section className="quest-section">
          <h4 className="quest-section-title">江湖足迹</h4>
          <ol className="story-chain">
            {data.story.map((node) => (
              <li
                key={node.id}
                className={`story-node${node.done ? " done" : ""}${node.current ? " current" : ""}`}
              >
                <span className="story-node-title">{node.title}</span>
                {node.current && <span className="story-node-now">今</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {data.rumors.length > 0 && (
        <section className="quest-section">
          <h4 className="quest-section-title">江湖传闻</h4>
          <ul className="rumor-list">
            {data.rumors.map((rumor) => (
              <li key={rumor.id} className="rumor-item">
                {rumor.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="quest-section">
        <h4 className="quest-section-title">手头之事</h4>
        {data.quests.length === 0 ? (
          <p className="quest-empty">眼下并无差事。</p>
        ) : (
          data.quests.map((q) => (
            <QuestCard
              key={q.id}
              quest={q}
              onGoTo={onGoTo}
              onAccept={onAccept}
              onReport={onReport}
            />
          ))
        )}
      </section>
    </div>
  );
}

function QuestCard({
  quest,
  onGoTo,
  onAccept,
  onReport,
}: {
  quest: QuestView;
  onGoTo: (roomId: string) => void;
  onAccept: (questId: string) => void;
  onReport: (questId: string) => void;
}): JSX.Element {
  const pendingGoto = quest.phases.find(
    (phase) => phase.type === "goto" && !phase.done && phase.targetRoomId,
  );
  const allDone = quest.phases.length > 0 && quest.phases.every((p) => p.done);

  return (
    <div className="quest-card" data-testid="quest-card">
      <div className="quest-card-head">
        <span className="quest-card-name">{quest.name}</span>
        <span className={`quest-kind kind-${quest.kind}`}>{KIND_LABEL[quest.kind]}</span>
      </div>
      <p className="quest-briefing">{quest.briefing}</p>
      <ul className="quest-phases">
        {quest.phases.map((p, i) => (
          <li key={i} className={p.done ? "done" : ""}>
            {PHASE_LABEL[p.type]} {p.targetName}
            {p.progress && `（${p.progress.cur}/${p.progress.need}）`}
          </li>
        ))}
      </ul>
      <p className="quest-reward">
        历练 {quest.rewards.exp} · 潜能 {quest.rewards.potential} · 银两 {quest.rewards.silver}
      </p>
      <div className="chips">
        {quest.state === "available" && (
          <Chip label="接受" variant="action" onClick={() => onAccept(quest.id)} />
        )}
        {quest.state === "accepted" && pendingGoto && (
          <Chip label="前往" variant="action" onClick={() => onGoTo(pendingGoto.targetRoomId!)} />
        )}
        {quest.state === "accepted" && allDone && (
          <Chip label="交差" variant="action" onClick={() => onReport(quest.id)} />
        )}
        {quest.state === "completed" && <span className="quest-done-tag">已了结</span>}
      </div>
    </div>
  );
}
