// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useJournalLog, type JournalDraft } from "./journalLog.js";

type Api = ReturnType<typeof useJournalLog>;

const holder: { api: Api | null } = { api: null };

function Probe(): null {
  holder.api = useJournalLog();
  return null;
}

function mount(): Root {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<Probe />);
  });
  return root;
}

afterEach(() => {
  document.body.innerHTML = "";
  holder.api = null;
});

describe("useJournalLog（见闻串行入队）", () => {
  it("单行直接进入 entries；busy 时后续排队，settled 后放出", () => {
    mount();
    const api = () => holder.api!;
    act(() => api().enqueue({ text: "甲：第一行。" }));
    expect(api().entries).toHaveLength(1);
    expect(api().entries[0]!.text).toBe("甲：第一行。");
    act(() => api().enqueue({ text: "乙：应排队。" }));
    expect(api().entries).toHaveLength(1);
    act(() => api().onEntrySettled(api().entries[0]!.id));
    expect(api().entries).toHaveLength(2);
    expect(api().entries[1]!.text).toBe("乙：应排队。");
  });

  it("一次 enqueue 多行时严格串行放出", () => {
    mount();
    const api = () => holder.api!;
    const lines: JournalDraft[] = [
      { text: "村长：其一。" },
      { text: "其二。" },
      { text: "其三。" },
    ];
    act(() => api().enqueue(lines));
    expect(api().entries.map((e) => e.text)).toEqual(["村长：其一。"]);
    act(() => api().onEntrySettled(1));
    expect(api().entries.map((e) => e.text)).toEqual(["村长：其一。", "其二。"]);
    act(() => api().onEntrySettled(2));
    expect(api().entries.map((e) => e.text)).toEqual(["村长：其一。", "其二。", "其三。"]);
    act(() => api().onEntrySettled(3));
    expect(api().entries).toHaveLength(3);
  });

  it("clear 清空队列与条目", () => {
    mount();
    const api = () => holder.api!;
    act(() => api().enqueue([{ text: "a" }, { text: "b" }]));
    act(() => api().clear());
    expect(api().entries).toHaveLength(0);
    act(() => api().enqueue({ text: "c" }));
    expect(api().entries[0]!.id).toBe(1);
    expect(api().entries[0]!.text).toBe("c");
  });
});
