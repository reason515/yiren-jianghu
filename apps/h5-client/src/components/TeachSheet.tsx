import type { JSX } from "react";
import type { TeachOfferData } from "../lib/teachTypes.js";
import { Chip } from "./base/Chip.js";

export type { TeachOfferData, TeachOfferRow, TeachPerformOfferRow } from "../lib/teachTypes.js";

export interface TeachSheetProps {
  data: TeachOfferData;
  pending?: boolean;
  onLearn: (skillId: string) => void;
  onLearnPerform?: (performId: string) => void;
}

/** 当面请教：武功升段 + 绝招学会（DC-039/041）。 */
export function TeachSheet({
  data,
  pending,
  onLearn,
  onLearnPerform,
}: TeachSheetProps): JSX.Element {
  const performOffers = data.performOffers ?? [];
  return (
    <section className="teach" aria-label={`${data.npc.name}授艺`}>
      <p className="teach-hint">
        {data.npc.kind === "tuition_teacher"
          ? "缴学费、凝神听讲，便可精进一筹。根基扎实后，亦可请教绝招。"
          : "既入师门，当面请教不另取银两；武功与绝招皆须当面点拨。"}
      </p>
      {data.offers.length === 0 && performOffers.length === 0 ? (
        <p className="scene-hint">对方此刻无可授之艺。</p>
      ) : (
        <>
          {data.offers.length > 0 ? (
            <div className="teach-list">
              <h4 className="teach-sub">武功</h4>
              {data.offers.map((offer) => (
                <div
                  className="teach-row"
                  key={offer.skillId}
                  data-testid={`teach-${offer.skillId}`}
                >
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
          ) : null}
          {performOffers.length > 0 ? (
            <div className="teach-list">
              <h4 className="teach-sub">绝招</h4>
              {performOffers.map((offer) => (
                <div
                  className="teach-row"
                  key={offer.performId}
                  data-testid={`teach-pf-${offer.performId}`}
                >
                  <div>
                    <strong>{offer.performName}</strong>
                    <span>
                      属 {offer.skillName} · 须达 Lv {offer.learnMinLevel}
                    </span>
                    {!offer.canLearn && offer.blockedReason ? (
                      <em className="teach-block">{offer.blockedReason}</em>
                    ) : (
                      <span className="teach-cost">当面点拨，不另取银两</span>
                    )}
                  </div>
                  <Chip
                    label={offer.alreadyLearned ? "已会" : pending ? "请教中…" : "学招"}
                    variant="perform"
                    disabled={pending || !offer.canLearn || !onLearnPerform}
                    onClick={() => onLearnPerform?.(offer.performId)}
                  />
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
