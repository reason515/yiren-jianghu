import { useLayoutEffect, useRef, useState, type JSX, type ReactNode } from "react";
import { Sheet } from "./base/Sheet.js";

/**
 * 见闻（动态文字流，V2.10 参照 xkx EventLog；V2.11 关键字高亮）。
 * 场景描述是「静态所见」；见闻是「互动后的动态记录」——交谈/交易/拾取/战斗/交差等
 * 事件追加到此处，可展开全屏滚动翻看历史、自动跟随最新。
 * 渲染时人名前缀（`名字：`）玉色、数字金色，避免全文同色平淡。
 */
export interface JournalEntry {
  id: number;
  text: string;
  /** combat 类目高亮（战斗演出）；其余默认。 */
  kind?: "combat" | "normal";
}

export interface JournalFeedProps {
  entries: JournalEntry[];
  onClose?: () => void;
}

const SUMMARY_COUNT = 3;

/** 人名前缀：行首「XXX：」玉色（说话者/角色）。 */
const NAME_RE = /^([\u4e00-\u9fff·A-Za-z]{1,12}?[：:])/;
/** 数字：金色（数值语义，金银/经验/潜能等）。 */
const NUM_RE = /(\d+(?:\.\d+)?)/g;

/** 轻量富文本：人名前缀 + 数字高亮，其余原文。 */
function renderRich(text: string, keyBase: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let rest = text;
  const name = rest.match(NAME_RE);
  if (name) {
    parts.push(
      <span className="jl-name" key={`${keyBase}-n`}>
        {name[1]}
      </span>,
    );
    rest = rest.slice(name[0].length);
  }
  let last = 0;
  let index = 0;
  for (const m of rest.matchAll(NUM_RE)) {
    if (m.index > last) parts.push(rest.slice(last, m.index));
    parts.push(
      <span className="jl-num" key={`${keyBase}-d${index++}`}>
        {m[0]}
      </span>,
    );
    last = (m.index ?? 0) + m[0].length;
  }
  if (last < rest.length) parts.push(rest.slice(last));
  return parts;
}

export function JournalFeed({ entries, onClose }: JournalFeedProps): JSX.Element {
  const panelRef = useRef<HTMLElement>(null);
  const followingRef = useRef(true);
  const pinningRef = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const [following, setFollowing] = useState(true);
  const lastId = entries.length > 0 ? entries[entries.length - 1]!.id : 0;
  const latestFew = entries.slice(-SUMMARY_COUNT);

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
                {renderRich(entry.text, `s${entry.id}`)}
              </span>
            ))
          ) : (
            <span className="journal-summary-line">尚无新的见闻</span>
          )}
        </span>
      </button>

      {expanded && (
        <Sheet open title="见闻" onClose={closeLog}>
          <section
            ref={panelRef}
            className="journal-panel"
            aria-label="完整见闻"
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
                <p key={entry.id} className={entry.kind === "combat" ? "hl" : ""}>
                  {renderRich(entry.text, `p${entry.id}`)}
                </p>
              ))}
            </div>
          </section>
        </Sheet>
      )}
    </section>
  );
}
