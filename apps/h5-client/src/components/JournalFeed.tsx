import { useEffect, useLayoutEffect, useRef, useState, type JSX, type ReactNode } from "react";

/**
 * 见闻（动态文字流，V2.10 参照 xkx EventLog；V2.11 关键字高亮；V2.12 固定高度展开；
 * V2.14 打字机显现；V2.14.2 **串行入队在 useJournalLog**——本组件只打「当前末行」）。
 * 场景描述是「静态所见」；见闻是「互动后的动态记录」。
 * 多行交谈不得一次塞进 entries：由上层 enqueue 排队，settled 后再追加下一行。
 */
export interface JournalEntry {
  id: number;
  text: string;
  /** combat 类目高亮（战斗演出）；其余默认。 */
  kind?: "combat" | "normal";
  /** 关键词标记（地名/物品名等），渲染时用独立语义色，与人名前缀玉色区分。 */
  mark?: Array<{ text: string; cls: "place" | "item" }>;
}

export interface JournalFeedProps {
  entries: JournalEntry[];
  onClose?: () => void;
  /**
   * 某条见闻已展示完毕（打字结束 / 无需打字 / 首屏历史）时回调。
   * 供 `useJournalLog` 放出队列中的下一行——交谈多句与观察同一套串行。
   */
  onEntrySettled?: (id: number) => void;
}

const SUMMARY_COUNT = 3;
/** 展开面板固定高度（超出滚动，V2.12）。 */
const PANEL_HEIGHT = 260;
/** 打字机：每批字数 / 间隔（「几个几个」出现）。 */
const TYPE_CHUNK = 2;
const TYPE_INTERVAL_MS = 32;

/** 人名前缀：行首「XXX：」玉色（说话者/角色）。 */
const NAME_RE = /^([\u4e00-\u9fff·A-Za-z]{1,12}?[：:])/;
/** 数字：金色（数值语义，金银/经验/潜能等）。 */
const NUM_RE = /(\d+(?:\.\d+)?)/g;

interface Segment {
  text: string;
  cls?: string;
}

/** 按 mark 关键词切段（地名/物品名独立色）。 */
function splitByMarks(text: string, marks?: JournalEntry["mark"]): Segment[] {
  if (!marks?.length) return [{ text }];
  const parts: Segment[] = [];
  let rest = text;
  for (const m of marks) {
    const idx = rest.indexOf(m.text);
    if (idx === -1) continue;
    if (idx > 0) parts.push({ text: rest.slice(0, idx) });
    parts.push({ text: m.text, cls: m.cls === "place" ? "jl-place" : "jl-item" });
    rest = rest.slice(idx + m.text.length);
  }
  if (rest) parts.push({ text: rest });
  return parts;
}

/** 段内数字高亮（金色 + digit 字体）。 */
function numSegments(text: string, keyBase: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const m of text.matchAll(NUM_RE)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <span className="jl-num" key={`${keyBase}-d${index++}`}>
        {m[0]}
      </span>,
    );
    last = (m.index ?? 0) + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** 轻量富文本：人名前缀 + 地名/物品 mark + 数字高亮，其余原文。 */
function renderRich(text: string, keyBase: string, mark?: JournalEntry["mark"]): ReactNode[] {
  const parts: ReactNode[] = [];
  const segments = splitByMarks(text, mark);
  let first = true;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    if (seg.cls) {
      parts.push(
        <span className={seg.cls} key={`${keyBase}-m${i}`}>
          {seg.text}
        </span>,
      );
      first = false;
      continue;
    }
    let segText = seg.text;
    if (first) {
      const name = segText.match(NAME_RE);
      if (name) {
        parts.push(
          <span className="jl-name" key={`${keyBase}-n`}>
            {name[1]}
          </span>,
        );
        segText = segText.slice(name[0].length);
      }
      first = false;
    }
    if (segText) parts.push(...numSegments(segText, `${keyBase}-${i}`));
  }
  return parts;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** 末行打字机：按批揭示；完成后 onDone（上层再 enqueue 下一行）。 */
function TypewriterRich({
  entry,
  keyBase,
  active,
  onReveal,
  onDone,
}: {
  entry: JournalEntry;
  keyBase: string;
  active: boolean;
  onReveal?: () => void;
  onDone?: () => void;
}): JSX.Element {
  const full = entry.text.length;
  const skipMotion = prefersReducedMotion();
  const [shown, setShown] = useState(() => (active && !skipMotion ? 0 : full));
  const onRevealRef = useRef(onReveal);
  const onDoneRef = useRef(onDone);
  const doneOnceRef = useRef(false);
  onRevealRef.current = onReveal;
  onDoneRef.current = onDone;
  const typing = active && shown < full;

  useEffect(() => {
    doneOnceRef.current = false;
    const finish = (): void => {
      if (doneOnceRef.current) return;
      doneOnceRef.current = true;
      onDoneRef.current?.();
    };
    if (!active) {
      setShown(full);
      return;
    }
    if (skipMotion || full === 0) {
      setShown(full);
      finish();
      return;
    }
    setShown(0);
    let i = 0;
    const timer = window.setInterval(() => {
      i = Math.min(full, i + TYPE_CHUNK);
      setShown(i);
      onRevealRef.current?.();
      if (i >= full) {
        window.clearInterval(timer);
        finish();
      }
    }, TYPE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [active, entry.id, entry.text, full, skipMotion]);

  return (
    <span className={typing ? "jl-typing" : undefined} data-typing={typing ? "1" : undefined}>
      {renderRich(entry.text.slice(0, shown), keyBase, entry.mark)}
      {typing && <span className="jl-caret" aria-hidden="true" />}
    </span>
  );
}

export function JournalFeed({ entries, onClose, onEntrySettled }: JournalFeedProps): JSX.Element {
  const panelRef = useRef<HTMLElement>(null);
  const summaryTextRef = useRef<HTMLSpanElement>(null);
  const followingRef = useRef(true);
  const pinningRef = useRef(false);
  const settledRef = useRef<Set<number>>(new Set());
  /** 首屏已有条目的 id 上限；仅大于此值的末行才打字。 */
  const baselineRef = useRef<number | null>(null);
  const onSettledRef = useRef(onEntrySettled);
  onSettledRef.current = onEntrySettled;
  const [expanded, setExpanded] = useState(false);
  const [following, setFollowing] = useState(true);
  const lastId = entries.length > 0 ? entries[entries.length - 1]!.id : 0;

  if (baselineRef.current === null) {
    baselineRef.current = lastId;
  }
  const baseline = baselineRef.current;
  const latestFew = entries.slice(-SUMMARY_COUNT);
  const panelEntries = entries.slice(-100);
  /**
   * 仅对新触发且尚未 settled 的末行打字。
   * 展开/收起会卸载重挂行组件——已 settled 的绝不再 active，避免打字机重播。
   */
  const typingTargetId = lastId > baseline && !settledRef.current.has(lastId) ? lastId : null;

  const reportSettled = (id: number): void => {
    if (settledRef.current.has(id)) return;
    settledRef.current.add(id);
    onSettledRef.current?.(id);
  };

  /** 展开/收起：打断打字并全文展示，不重播打字机。 */
  const settleTypingForToggle = (): void => {
    if (lastId > baseline) reportSettled(lastId);
  };

  // 首屏历史 / 无需打字的末行：立刻 settled，避免上层队列卡死
  useEffect(() => {
    for (const e of entries) {
      if (e.id <= baseline) reportSettled(e.id);
    }
    if (typingTargetId === null && lastId > 0) reportSettled(lastId);
  }, [entries, baseline, lastId, typingTargetId]);

  const pinFeedsToBottom = (): void => {
    const panel = panelRef.current;
    if (panel) {
      pinningRef.current = true;
      panel.scrollTop = panel.scrollHeight;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          pinningRef.current = false;
        });
      });
    }
    const summary = summaryTextRef.current;
    if (summary) summary.scrollTop = summary.scrollHeight;
  };

  useLayoutEffect(() => {
    if (expanded) {
      if (followingRef.current) pinFeedsToBottom();
    } else {
      pinFeedsToBottom();
    }
  }, [expanded, lastId, panelEntries.length, latestFew.length]);

  const openLog = (): void => {
    settleTypingForToggle();
    followingRef.current = true;
    setFollowing(true);
    setExpanded(true);
  };

  const closeLog = (): void => {
    settleTypingForToggle();
    setExpanded(false);
    onClose?.();
  };

  const renderLine = (entry: JournalEntry, keyBase: string): JSX.Element => {
    const active = typingTargetId !== null && entry.id === typingTargetId;
    return (
      <TypewriterRich
        entry={entry}
        keyBase={keyBase}
        active={active}
        onReveal={active && (!expanded || followingRef.current) ? pinFeedsToBottom : undefined}
        onDone={active ? () => reportSettled(entry.id) : undefined}
      />
    );
  };

  return (
    <section className="journal-feed" aria-label="见闻">
      {expanded ? (
        <div className="journal-expand">
          <div className="journal-expand-head">
            <span className="journal-summary-title">见闻</span>
            <button
              type="button"
              className="journal-expand-close"
              onClick={closeLog}
              aria-label="收起见闻"
            >
              收起
            </button>
          </div>
          <section
            ref={panelRef}
            className="journal-panel"
            aria-label="完整见闻"
            style={{ height: PANEL_HEIGHT }}
            onScroll={() => {
              if (pinningRef.current) return;
              const panel = panelRef.current;
              if (!panel) return;
              const atBottom = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 48;
              followingRef.current = atBottom;
              setFollowing(atBottom);
            }}
          >
            {!following && (
              <div className="journal-head">
                <button
                  type="button"
                  onClick={() => {
                    followingRef.current = true;
                    setFollowing(true);
                    pinFeedsToBottom();
                  }}
                >
                  最新
                </button>
              </div>
            )}
            <div aria-live="polite" aria-relevant="additions text">
              {panelEntries.map((entry) => (
                <p key={entry.id} className={entry.kind === "combat" ? "hl" : undefined}>
                  {renderLine(entry, `p${entry.id}`)}
                </p>
              ))}
              {entries.length === 0 && <p>尚无新的见闻</p>}
            </div>
          </section>
        </div>
      ) : (
        <button
          type="button"
          className="journal-summary"
          data-testid="journal-feed"
          aria-expanded={expanded}
          onClick={openLog}
        >
          <span className="journal-summary-head">
            <span className="journal-summary-title">见闻</span>
            <span className="journal-summary-open">
              展开
              <span className="journal-summary-caret" aria-hidden="true">
                ▾
              </span>
            </span>
          </span>
          <span
            ref={summaryTextRef}
            className="journal-summary-text"
            onWheel={(e) => e.stopPropagation()}
          >
            {latestFew.length > 0 ? (
              latestFew.map((entry) => (
                <span
                  key={entry.id}
                  className={`journal-summary-line${entry.kind === "combat" ? " hl" : ""}`}
                >
                  {renderLine(entry, `s${entry.id}`)}
                </span>
              ))
            ) : (
              <span className="journal-summary-line">尚无新的见闻</span>
            )}
          </span>
        </button>
      )}
    </section>
  );
}
