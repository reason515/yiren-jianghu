import type { JSX } from "react";
import type { TeachOfferData } from "../lib/teachTypes.js";
import { Chip } from "./base/Chip.js";

export type { TeachOfferData, TeachOfferRow } from "../lib/teachTypes.js";

export interface TeachSheetProps {
  data: TeachOfferData;
  pending?: boolean;
  onLearn: (skillId: string) => void;
}

/** 当面请教：展示可教武功与银/精/潜能消耗（DC-039）。 */
export function TeachSheet({ data, pending, onLearn }: TeachSheetProps): JSX.Element {
  return (
    <section className="teach" aria-label={`${data.npc.name}授艺`}>
      <p className="teach-hint">
        {data.npc.kind === "tuition_teacher"
          ? "缴学费、凝神听讲，便可精进一筹。"
          : "既入师门，当面请教不另取银两，仍须耗精与潜能。"}
      </p>
      {data.offers.length === 0 ? (
        <p className="scene-hint">对方此刻无可授之艺。</p>
      ) : (
        <div className="teach-list">
          {data.offers.map((offer) => (
            <div className="teach-row" key={offer.skillId} data-testid={`teach-${offer.skillId}`}>
              <div>
                <strong>{offer.skillName}</strong>
                <span>
                  Lv {offer.currentLevel} → {offer.nextLevel}
                  {offer.teachCap > 0 ? `（可至 ${offer.teachCap}）` : ""}
                </span>
                <span className="teach-cost">
                  {offer.cost.silver > 0 ? `银 ${offer.cost.silver} · ` : "免学费 · "}精{" "}
                  {offer.cost.jing} · 潜能 {offer.cost.potential}
                </span>
                {!offer.canLearn && offer.blockedReason ? (
                  <em className="teach-block">{offer.blockedReason}</em>
                ) : null}
              </div>
              <Chip
                label={pending ? "请教中…" : "请教"}
                variant="action"
                disabled={pending || !offer.canLearn}
                onClick={() => onLearn(offer.skillId)}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
