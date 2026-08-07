// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { ForumView } from "./ForumView.js";
import { PostComposer } from "./PostComposer.js";
import type { ForumViewData } from "../lib/forumTypes.js";

function render(ui: ReactElement): { host: HTMLDivElement; root: Root } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(ui));
  return { host, root };
}

afterEach(() => {
  document.body.innerHTML = "";
});

const DATA: ForumViewData = {
  sections: [
    { id: "s1", name: "新手茶棚", postCount: 12 },
    { id: "s2", name: "江湖见闻", postCount: 34 },
  ],
  posts: [
    {
      id: "p1",
      sectionId: "s1",
      title: "初入江湖，求前辈指点",
      body: "刚出村口，野狗都打不过，该如何是好？",
      authorName: "陆小风",
      createdAt: "前日",
      likeCount: 3,
      likedByMe: false,
      commentCount: 2,
    },
    {
      id: "p2",
      sectionId: "s2",
      title: "玄门剑宗入门心得",
      body: "入门先正心，果然不虚。",
      authorName: "张三丰",
      createdAt: "昨日",
      likeCount: 8,
      likedByMe: true,
      commentCount: 5,
    },
  ],
  comments: [
    {
      id: "c1",
      postId: "p1",
      body: "先去村外小径打野狗练手。",
      authorName: "老江湖",
      createdAt: "前日",
    },
  ],
};

describe("ForumView（论坛）", () => {
  const noop = (): void => undefined;

  it("板块列表渲染与打开回调", () => {
    let opened = "";
    const { host } = render(
      <ForumView
        data={DATA}
        view="sections"
        onOpenSection={(s) => (opened = s)}
        onOpenPost={noop}
        onBack={noop}
        onLike={noop}
        onReportPost={noop}
        onReportComment={noop}
        onComposePost={noop}
        onComposeComment={noop}
      />,
    );
    expect(host.textContent).toContain("新手茶棚");
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>(".forum-section")]
        .find((b) => b.textContent?.includes("江湖见闻"))!
        .click(),
    );
    expect(opened).toBe("s2");
  });

  it("帖子列表：标题/作者/点赞·评论数；打开与点赞回调；顶部可发帖", () => {
    let opened = "";
    let liked = "";
    let composed = 0;
    const { host } = render(
      <ForumView
        data={DATA}
        view="posts"
        onOpenSection={noop}
        onOpenPost={(p) => (opened = p)}
        onBack={noop}
        onLike={(p) => (liked = p)}
        onReportPost={noop}
        onReportComment={noop}
        onComposePost={() => (composed += 1)}
        onComposeComment={noop}
      />,
    );
    expect(host.textContent).toContain("初入江湖，求前辈指点");
    expect(host.textContent).toContain("3 赞 · 2 评");
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>(".forum-post-title")]
        .find((b) => b.textContent === "初入江湖，求前辈指点")!
        .click(),
    );
    expect(opened).toBe("p1");
    act(() => host.querySelector<HTMLButtonElement>(".forum-compose")!.click());
    expect(composed).toBe(1);
  });

  it("帖子详情：正文/评论/点赞·举报/回帖", () => {
    const likes: string[] = [];
    const reports: string[] = [];
    let commented = 0;
    const { host } = render(
      <ForumView
        data={DATA}
        view="post"
        activePost={DATA.posts[0]}
        onOpenSection={noop}
        onOpenPost={noop}
        onBack={noop}
        onLike={(p) => likes.push(p)}
        onReportPost={(p) => reports.push(p)}
        onReportComment={noop}
        onComposePost={noop}
        onComposeComment={() => (commented += 1)}
      />,
    );
    expect(host.textContent).toContain("野狗都打不过");
    expect(host.textContent).toContain("先去村外小径打野狗练手");
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>(".chip")]
        .find((b) => b.textContent === "点赞")!
        .click(),
    );
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>(".chip")]
        .find((b) => b.textContent === "举报")!
        .click(),
    );
    expect(likes).toEqual(["p1"]);
    expect(reports).toEqual(["p1"]);
    act(() => host.querySelector<HTMLButtonElement>(".forum-compose")!.click());
    expect(commented).toBe(1);
  });
});

describe("PostComposer（发帖/评论）", () => {
  it("填写标题正文后提交", () => {
    let submitted: unknown = null;
    const { host } = render(
      <PostComposer
        open
        title="发新帖"
        showTitleField
        maxBodyLength={200}
        submitLabel="发布"
        onSubmit={(v) => (submitted = v)}
        onClose={() => undefined}
      />,
    );
    const setInput = (sel: string, value: string): void => {
      const el = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(sel)!;
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(proto.prototype, "value")!.set!;
      act(() => {
        setter.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    setInput('input[aria-label="标题"]', "求指点");
    setInput('textarea[aria-label="正文"]', "村外野狗怎么打？");
    act(() =>
      host
        .querySelector<HTMLFormElement>(".form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    expect(submitted).toEqual({ title: "求指点", body: "村外野狗怎么打？" });
  });

  it("正文为空时禁用提交", () => {
    const { host } = render(
      <PostComposer
        open
        title="发新帖"
        showTitleField
        maxBodyLength={200}
        submitLabel="发布"
        onSubmit={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(host.querySelector<HTMLButtonElement>(".btn.primary")!.disabled).toBe(true);
  });
});
