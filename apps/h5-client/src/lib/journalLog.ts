import { useCallback, useRef, useState } from "react";
import type { JournalEntry } from "../components/JournalFeed.js";

/** 入队草稿（id 由 hook 分配）。 */
export type JournalDraft = {
  text: string;
  kind?: JournalEntry["kind"];
  mark?: JournalEntry["mark"];
};

/**
 * 见闻串行入队（V2.14.2）：状态里同时最多新增一行，打字/展示完毕再放出下一行。
 * 交谈多句、连续事件都走同一队列，与「观察一次一行」一致——系统性避免一次多行并行。
 */
export function useJournalLog(): {
  entries: JournalEntry[];
  /** 追加一行或多行；多行会排队，前一行 settled 后才进入 entries。 */
  enqueue: (draft: JournalDraft | JournalDraft[]) => void;
  /** JournalFeed 在一行打完（或无需打字）时回调。 */
  onEntrySettled: (id: number) => void;
  clear: () => void;
} {
  const idRef = useRef(0);
  const queueRef = useRef<JournalEntry[]>([]);
  /** 当前 entries 末行仍在打字/等待 settled。 */
  const busyRef = useRef(false);
  const lastShownIdRef = useRef(0);
  const [entries, setEntries] = useState<JournalEntry[]>([]);

  const pump = useCallback((): void => {
    if (busyRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;
    busyRef.current = true;
    lastShownIdRef.current = next.id;
    setEntries((prev) => [...prev, next]);
  }, []);

  const enqueue = useCallback(
    (draft: JournalDraft | JournalDraft[]): void => {
      const list = Array.isArray(draft) ? draft : [draft];
      for (const d of list) {
        idRef.current += 1;
        queueRef.current.push({
          id: idRef.current,
          text: d.text,
          kind: d.kind,
          mark: d.mark,
        });
      }
      pump();
    },
    [pump],
  );

  const onEntrySettled = useCallback(
    (id: number): void => {
      if (id !== lastShownIdRef.current) return;
      if (!busyRef.current) return;
      busyRef.current = false;
      pump();
    },
    [pump],
  );

  const clear = useCallback((): void => {
    idRef.current = 0;
    queueRef.current = [];
    busyRef.current = false;
    lastShownIdRef.current = 0;
    setEntries([]);
  }, []);

  return { entries, enqueue, onEntrySettled, clear };
}
