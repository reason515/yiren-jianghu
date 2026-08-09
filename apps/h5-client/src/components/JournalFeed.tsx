import { useEffect, useLayoutEffect, useRef, useState, type JSX, type ReactNode } from "react";

/**
 * 见闻（动态文字流，V2.10 参照 xkx EventLog；V2.11 关键字高亮；V2.12 固定高度展开；
 * V2.14 新条目打字机显现）。
 * 场景描述是「静态所见」；见闻是「互动后的动态记录」——交谈/交易/拾取/战斗/交差等
 * 事件追加到此处，可展开固定高度面板滚动翻看历史、自动跟随最新。
 * 渲染时人名前缀（`名字：`）玉色、数字金色、地名（mark）青蓝，避免全文同色平淡。
 * 新追加条目以「几个字一批」打字机显现，便于注意到变化（首屏历史不动画）。
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
    // mark 段（地名/物品）：整段语义色，不再拆人名/数字
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
    // 人名前缀只在首个非 mark 段处理
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

/** 新条目打字机：按批揭示字符；历史条目立刻全文。打字中带玉色提示与光标。 */
function TypewriterRich({
  entry,
  keyBase,
  animate,
  onReveal,
}: {
  entry: JournalEntry;
  keyBase: string;
  animate: boolean;
  onReveal?: () => void;
}): JSX.Element {
  const full = entry.text.length;
  const skip = !animate || prefersReducedMotion();
  const [shown, setShown] = useState(() => (skip ? full : 0));
  const onRevealRef = useRef(onReveal);
  onRevealRef.current = onReveal;
  const typing = shown < full;

  useEffect(() => {
    if (!animate || prefersReducedMotion()) {
      setShown(full);
      return;
    }
    setShown(0);
    let i = 0;
    const timer = window.setInterval(() => {
      i = Math.min(full, i + TYPE_CHUNK);
      setShown(i);
      onRevealRef.current?.();
      if (i >= full) window.clearInterval(timer);
    }, TYPE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [animate, entry.id, entry.text, full]);

  return (
    <span className={typing ? "jl-typing" : undefined} data-typing={typing ? "1" : undefined}>
      {renderRich(entry.text.slice(0, shown), keyBase, entry.mark)}
      {typing && <span className="jl-caret" aria-hidden="true" />}
    </span>
  );
}

export function JournalFeed({ entries, onClose }: JournalFeedProps): JSX.Element {
  const panelRef = useRef<HTMLElement>(null);
  const followingRef = useRef(true);
  const pinningRef = useRef(false);
  /** 首屏已有条目的 id 上限；大于此值的才打字机显现。 */
  const baselineRef = useRef<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [following, setFollowing] = useState(true);
  const lastId = entries.length > 0 ? entries[entries.length - 1]!.id : 0;
  const latestFew = entries.slice(-SUMMARY_COUNT);

  if (baselineRef.current === null) {
    baselineRef.current = lastId;
  }

  const shouldAnimate = (id: number): boolean => id > (baselineRef.current ?? 0);

  const pinToBottom = (): void => {
    const panel = panelRef.current;
    if (!panel) return;
    pinningRef.current = true;
    panel.scrollTop = panel.scrollHeight;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        pinningRef.current = false;
      });
    });
  };

  useLayoutEffect(() => {
    if (expanded && followingRef.current) pinToBottom();
  }, [expanded, lastId, entries.length]);

  const openLog = (): void => {
    followingRef.current = true;
    setFollowing(true);
    setExpanded(true);
  };

  const closeLog = (): void => {
    setExpanded(false);
    onClose?.();
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
                    pinToBottom();
                  }}
                >
                  最新
                </button>
              </div>
            )}
            <div aria-live="polite" aria-relevant="additions text">
              {entries.slice(-100).map((entry) => (
                <p key={entry.id} className={entry.kind === "combat" ? "hl" : undefined}>
                  <TypewriterRich
                    entry={entry}
                    keyBase={`p${entry.id}`}
                    animate={shouldAnimate(entry.id)}
                    onReveal={entry.id === lastId && followingRef.current ? pinToBottom : undefined}
                  />
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
          <span className="journal-summary-text">
            {latestFew.length > 0 ? (
              latestFew.map((entry) => (
                <span
                  key={entry.id}
                  className={`journal-summary-line${entry.kind === "combat" ? " hl" : ""}`}
                >
                  <TypewriterRich
                    entry={entry}
                    keyBase={`s${entry.id}`}
                    animate={shouldAnimate(entry.id)}
                  />
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
