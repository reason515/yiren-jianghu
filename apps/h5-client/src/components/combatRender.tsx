import type { ReactNode } from "react";
import type { CombatLine } from "../lib/combatTypes.js";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 在未着色片段里给「你」与敌名上色，区分攻守双方。 */
export function paintActorNames(text: string, foeNames: string[], keyPrefix: string): ReactNode[] {
  const names = [...new Set(foeNames.filter((n) => n.length > 0))].sort(
    (a, b) => b.length - a.length,
  );
  const pattern =
    names.length > 0 ? new RegExp(`(你|${names.map(escapeRegExp).join("|")})`, "g") : /(你)/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(<span key={`${keyPrefix}-t${i++}`}>{text.slice(last, match.index)}</span>);
    }
    const token = match[1]!;
    const mark = token === "你" ? "self" : "foe";
    nodes.push(
      <span key={`${keyPrefix}-${mark}${i++}`} className={`cm-${mark}`}>
        {token}
      </span>,
    );
    last = match.index + token.length;
  }
  if (last < text.length) {
    nodes.push(<span key={`${keyPrefix}-t${i}`}>{text.slice(last)}</span>);
  }
  return nodes.length > 0 ? nodes : [<span key={`${keyPrefix}-empty`}>{text}</span>];
}

export interface RenderCombatOptions {
  foeNames?: string[];
}

/** 关键字着色 + 敌我名分色；整行保持纸色底。 */
export function renderCombatSegments(line: CombatLine, opts?: RenderCombatOptions): ReactNode {
  const segments = line.segments?.length ? line.segments : [{ text: line.text }];
  const foeNames = opts?.foeNames ?? [];
  return segments.map((seg, index) => {
    if (seg.mark) {
      return (
        <span key={index} className={`cm-${seg.mark}`}>
          {seg.text}
        </span>
      );
    }
    return <span key={index}>{paintActorNames(seg.text, foeNames, `s${index}`)}</span>;
  });
}
