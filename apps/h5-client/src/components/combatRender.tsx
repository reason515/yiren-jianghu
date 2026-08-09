import type { ReactNode } from "react";
import type { CombatLine } from "../lib/combatTypes.js";

/** 只给句内关键字上色，整行保持纸色。 */
export function renderCombatSegments(line: CombatLine): ReactNode {
  const segments = line.segments?.length ? line.segments : [{ text: line.text }];
  return segments.map((seg, index) =>
    seg.mark ? (
      <span key={index} className={`cm-${seg.mark}`}>
        {seg.text}
      </span>
    ) : (
      <span key={index}>{seg.text}</span>
    ),
  );
}
