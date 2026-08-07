import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { ForumError, createForumService } from "./forumService.js";
import type { Db, DbRow } from "./db.js";

interface CharState {
  id: string;
  account_id: string;
  status: string;
  name: string;
}

interface SectionState {
  id: string;
  name: string;
  sort: number;
}

interface PostState {
  id: string;
  section_id: string;
  author_character_id: string;
  title: string;
  body: string;
  status: string;
  created_at: string;
}

interface CommentState {
  id: string;
  post_id: string;
  author_character_id: string;
  body: string;
  status: string;
  created_at: string;
}

interface LikeState {
  post_id: string;
  character_id: string;
}

interface ReportState {
  target_type: string;
  target_id: string;
  reporter_character_id: string;
  reason: string;
}

const T0 = "2026-08-07T00:00:00.000Z";

function mockDb() {
  const state = {
    accounts: [] as Array<{ id: string; invite_code?: string }>,
    sessions: [] as Array<{ token: string; account_id: string; expires_at: string }>,
    characters: [] as CharState[],
    sections: [] as SectionState[],
    posts: [] as PostState[],
    comments: [] as CommentState[],
    likes: [] as LikeState[],
    reports: [] as ReportState[],
  };
  const db: Db = {
    async query<T extends DbRow>(text: string, params: unknown[] = []): Promise<{ rows: T[] }> {
      if (text.includes("FROM accounts WHERE invite_code")) {
        return {
          rows: state.accounts
            .filter((a) => a.invite_code === params[0])
            .map((a) => ({ id: a.id })) as unknown as T[],
        };
      }
      if (text.includes("INSERT INTO accounts")) {
        const id = `acc_${state.accounts.length + 1}`;
        state.accounts.push({ id, invite_code: String(params[0]) });
        return { rows: [{ id }] as unknown as T[] };
      }
      if (text.includes("INSERT INTO sessions")) {
        state.sessions.push({
          token: String(params[0]),
          account_id: String(params[1]),
          expires_at: String(params[2]),
        });
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("FROM sessions WHERE token")) {
        return {
          rows: state.sessions
            .filter((s) => s.token === params[0])
            .map((s) => ({ account_id: s.account_id, expires_at: s.expires_at })) as unknown as T[],
        };
      }
      if (text.includes("SELECT id, name FROM characters")) {
        return {
          rows: state.characters
            .filter((c) => c.account_id === params[0] && c.status === "active")
            .map((c) => ({ id: c.id, name: c.name })) as unknown as T[],
        };
      }
      if (text.includes("SELECT count(*)::text AS n FROM forum_sections")) {
        return { rows: [{ n: String(state.sections.length) }] as unknown as T[] };
      }
      if (text.includes("INSERT INTO forum_sections")) {
        const s: SectionState = {
          id: `sec_${state.sections.length + 1}`,
          name: String(params[0]),
          sort: Number(params[1]),
        };
        state.sections.push(s);
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("FROM forum_sections s ORDER BY s.sort")) {
        return {
          rows: state.sections
            .slice()
            .sort((a, b) => a.sort - b.sort)
            .map((s) => {
              const n = state.posts.filter(
                (p) => p.section_id === s.id && p.status === "visible",
              ).length;
              return { id: s.id, name: s.name, post_count: n };
            }) as unknown as T[],
        };
      }
      if (text.includes("SELECT id FROM forum_sections WHERE id")) {
        return {
          rows: state.sections
            .filter((s) => s.id === params[0])
            .map((s) => ({ id: s.id })) as unknown as T[],
        };
      }
      if (
        text.includes("SELECT id FROM forum_posts WHERE id") &&
        text.includes("status = 'visible'")
      ) {
        return {
          rows: state.posts
            .filter((p) => p.id === params[0] && p.status === "visible")
            .map((p) => ({ id: p.id })) as unknown as T[],
        };
      }
      if (text.includes("INSERT INTO forum_posts")) {
        const p: PostState = {
          id: `post_${state.posts.length + 1}`,
          section_id: String(params[0]),
          author_character_id: String(params[1]),
          title: String(params[2]),
          body: String(params[3]),
          status: "visible",
          created_at: T0,
        };
        state.posts.push(p);
        return {
          rows: [
            {
              id: p.id,
              section_id: p.section_id,
              title: p.title,
              body: p.body,
              created_at: p.created_at,
            },
          ] as unknown as T[],
        };
      }
      // 帖子列表（公开，可选 section 过滤）——具体 SELECT 在前
      if (
        text.includes("FROM forum_posts p JOIN characters") &&
        text.includes("$1::uuid IS NULL")
      ) {
        const rows = state.posts
          .filter(
            (p) => p.status === "visible" && (params[0] == null || p.section_id === params[0]),
          )
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 50)
          .map((p) => {
            const author = state.characters.find((c) => c.id === p.author_character_id);
            return {
              id: p.id,
              section_id: p.section_id,
              title: p.title,
              body: p.body,
              created_at: p.created_at,
              author_name: author?.name ?? "?",
              like_count: state.likes.filter((l) => l.post_id === p.id).length,
              comment_count: state.comments.filter(
                (c) => c.post_id === p.id && c.status === "visible",
              ).length,
            };
          });
        return { rows } as unknown as { rows: T[] };
      }
      if (text.includes("FROM forum_posts p JOIN characters") && text.includes("WHERE p.id = $1")) {
        const p = state.posts.find((x) => x.id === params[0] && x.status === "visible");
        if (!p) return { rows: [] as unknown as T[] };
        const author = state.characters.find((c) => c.id === p.author_character_id);
        return {
          rows: [
            {
              id: p.id,
              section_id: p.section_id,
              title: p.title,
              body: p.body,
              created_at: p.created_at,
              author_name: author?.name ?? "?",
              like_count: state.likes.filter((l) => l.post_id === p.id).length,
              comment_count: state.comments.filter(
                (c) => c.post_id === p.id && c.status === "visible",
              ).length,
            },
          ] as unknown as T[],
        };
      }
      if (text.includes("FROM forum_comments cm JOIN characters")) {
        return {
          rows: state.comments
            .filter((c) => c.post_id === params[0] && c.status === "visible")
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .map((c) => {
              const author = state.characters.find((x) => x.id === c.author_character_id);
              return {
                id: c.id,
                post_id: c.post_id,
                body: c.body,
                created_at: c.created_at,
                author_name: author?.name ?? "?",
              };
            }) as unknown as T[],
        };
      }
      if (text.includes("INSERT INTO forum_comments")) {
        const c: CommentState = {
          id: `cmt_${state.comments.length + 1}`,
          post_id: String(params[0]),
          author_character_id: String(params[1]),
          body: String(params[2]),
          status: "visible",
          created_at: T0,
        };
        state.comments.push(c);
        return {
          rows: [{ id: c.id, post_id: c.post_id, created_at: c.created_at }] as unknown as T[],
        };
      }
      if (text.includes("SELECT post_id FROM forum_likes")) {
        return {
          rows: state.likes
            .filter((l) => l.post_id === params[0] && l.character_id === params[1])
            .map((l) => ({ post_id: l.post_id })) as unknown as T[],
        };
      }
      if (text.includes("DELETE FROM forum_likes")) {
        const idx = state.likes.findIndex(
          (l) => l.post_id === params[0] && l.character_id === params[1],
        );
        if (idx >= 0) state.likes.splice(idx, 1);
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("INSERT INTO forum_likes")) {
        state.likes.push({ post_id: String(params[0]), character_id: String(params[1]) });
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("SELECT count(*)::text AS n FROM forum_likes")) {
        const n = state.likes.filter((l) => l.post_id === params[0]).length;
        return { rows: [{ n: String(n) }] as unknown as T[] };
      }
      if (
        text.includes("SELECT id FROM forum_comments WHERE id") &&
        text.includes("status = 'visible'")
      ) {
        return {
          rows: state.comments
            .filter((c) => c.id === params[0] && c.status === "visible")
            .map((c) => ({ id: c.id })) as unknown as T[],
        };
      }
      if (text.includes("INSERT INTO forum_reports")) {
        state.reports.push({
          target_type: String(params[0]),
          target_id: String(params[1]),
          reporter_character_id: String(params[2]),
          reason: String(params[3]),
        });
        return { rows: [] as unknown as T[] };
      }
      return { rows: [] as unknown as T[] };
    },
  };
  return { db, state };
}

function boot() {
  const { db, state } = mockDb();
  state.characters.push(
    { id: "char_a", account_id: "acc_a", status: "active", name: "陆小风" },
    { id: "char_b", account_id: "acc_b", status: "active", name: "花满楼" },
  );
  state.sections.push(
    { id: "sec_1", name: "江湖茶话", sort: 1 },
    { id: "sec_2", name: "武林见闻", sort: 2 },
  );
  const forum = createForumService(db);
  return { db, state, forum };
}

describe("forumService.sections", () => {
  it("返回板块与可见帖数；空库自举 3 个默认板块", async () => {
    const { forum, state } = boot();
    state.posts.push({
      id: "post_1",
      section_id: "sec_1",
      author_character_id: "char_a",
      title: "问剑",
      body: "如何练快？",
      status: "visible",
      created_at: T0,
    });
    state.posts.push({
      id: "post_hidden",
      section_id: "sec_1",
      author_character_id: "char_a",
      title: "藏帖",
      body: "不可见",
      status: "hidden",
      created_at: T0,
    });
    const list = await forum.sections();
    expect(list.find((s) => s.id === "sec_1")).toMatchObject({ name: "江湖茶话", postCount: 1 });

    // 空库自举
    const { forum: f2, state: s2 } = boot();
    s2.sections = [];
    const bootstrapped = await f2.sections();
    expect(bootstrapped).toHaveLength(3);
    expect(bootstrapped.map((s) => s.name)).toEqual(["江湖茶话", "武林见闻", "悬赏与恩怨"]);
  });
});

describe("forumService.listPosts / getPost", () => {
  it("列表按创建倒序、可过滤板块、统计点赞与可见评论", async () => {
    const { forum, state } = boot();
    state.posts.push(
      {
        id: "post_1",
        section_id: "sec_1",
        author_character_id: "char_a",
        title: "先发",
        body: "最早",
        status: "visible",
        created_at: "2026-08-01T00:00:00.000Z",
      },
      {
        id: "post_2",
        section_id: "sec_1",
        author_character_id: "char_b",
        title: "后发",
        body: "较晚",
        status: "visible",
        created_at: "2026-08-02T00:00:00.000Z",
      },
      {
        id: "post_3",
        section_id: "sec_2",
        author_character_id: "char_b",
        title: "他坊",
        body: "别处",
        status: "visible",
        created_at: "2026-08-03T00:00:00.000Z",
      },
    );
    state.likes.push({ post_id: "post_1", character_id: "char_b" });
    state.comments.push({
      id: "cmt_1",
      post_id: "post_1",
      author_character_id: "char_b",
      body: "同问",
      status: "visible",
      created_at: T0,
    });
    state.comments.push({
      id: "cmt_hidden",
      post_id: "post_1",
      author_character_id: "char_b",
      body: "隐藏",
      status: "hidden",
      created_at: T0,
    });

    const all = await forum.listPosts();
    expect(all.map((p) => p.title)).toEqual(["他坊", "后发", "先发"]);
    const only1 = await forum.listPosts("sec_1");
    expect(only1.map((p) => p.title)).toEqual(["后发", "先发"]);
    expect(only1.find((p) => p.id === "post_1")).toMatchObject({
      authorName: "陆小风",
      likeCount: 1,
      commentCount: 1,
      likedByMe: false,
    });
  });

  it("帖子详情含评论；不存在/隐藏 → null", async () => {
    const { forum, state } = boot();
    state.posts.push({
      id: "post_1",
      section_id: "sec_1",
      author_character_id: "char_a",
      title: "问剑",
      body: "如何练快？",
      status: "visible",
      created_at: T0,
    });
    state.comments.push({
      id: "cmt_1",
      post_id: "post_1",
      author_character_id: "char_b",
      body: "先练三年基本功",
      status: "visible",
      created_at: T0,
    });
    const detail = await forum.getPost("post_1");
    expect(detail?.post).toMatchObject({ title: "问剑", authorName: "陆小风" });
    expect(detail?.comments).toHaveLength(1);
    expect(detail?.comments[0]).toMatchObject({ body: "先练三年基本功", authorName: "花满楼" });

    expect(await forum.getPost("post_nope")).toBeNull();
    state.posts[0]!.status = "hidden";
    expect(await forum.getPost("post_1")).toBeNull();
  });
});

describe("forumService.createPost", () => {
  it("校验：标题/正文长度、纯文本、板块存在；成功返回帖子", async () => {
    const { forum, state } = boot();
    await expect(
      forum.createPost("acc_x", { sectionId: "sec_1", title: "a", body: "b" }),
    ).rejects.toMatchObject({ code: "no_character" });
    await expect(
      forum.createPost("acc_a", { sectionId: "sec_1", title: "", body: "b" }),
    ).rejects.toMatchObject({ code: "invalid_title" });
    await expect(
      forum.createPost("acc_a", { sectionId: "sec_1", title: "x".repeat(25), body: "b" }),
    ).rejects.toMatchObject({ code: "invalid_title" });
    await expect(
      forum.createPost("acc_a", { sectionId: "sec_1", title: "x", body: "b".repeat(501) }),
    ).rejects.toMatchObject({ code: "invalid_body" });
    await expect(
      forum.createPost("acc_a", { sectionId: "sec_1", title: "<script>", body: "b" }),
    ).rejects.toMatchObject({ code: "invalid_content" });
    await expect(
      forum.createPost("acc_a", { sectionId: "sec_nope", title: "x", body: "b" }),
    ).rejects.toMatchObject({ code: "section_not_found" });

    const post = await forum.createPost("acc_a", {
      sectionId: "sec_1",
      title: "问剑",
      body: "剑走轻灵，如何入手？",
    });
    expect(post).toMatchObject({
      sectionId: "sec_1",
      title: "问剑",
      authorName: "陆小风",
      likeCount: 0,
      commentCount: 0,
    });
    expect(state.posts).toHaveLength(1);
  });
});

describe("forumService.addComment / toggleLike / reportPost", () => {
  it("评论：校验与成功；帖子不存在 → post_not_found", async () => {
    const { forum, state } = boot();
    state.posts.push({
      id: "post_1",
      section_id: "sec_1",
      author_character_id: "char_a",
      title: "问剑",
      body: "如何练快？",
      status: "visible",
      created_at: T0,
    });
    await expect(forum.addComment("acc_a", "post_1", "")).rejects.toMatchObject({
      code: "invalid_body",
    });
    await expect(forum.addComment("acc_a", "post_1", "带<标签>")).rejects.toMatchObject({
      code: "invalid_content",
    });
    await expect(forum.addComment("acc_a", "post_nope", "好问题")).rejects.toMatchObject({
      code: "post_not_found",
    });

    const cmt = await forum.addComment("acc_b", "post_1", "好问题，先练三年基本功");
    expect(cmt).toMatchObject({ postId: "post_1", authorName: "花满楼" });
    expect(state.comments).toHaveLength(1);
  });

  it("点赞/取消：往返切换且计数正确；帖子不存在拒绝", async () => {
    const { forum, state } = boot();
    state.posts.push({
      id: "post_1",
      section_id: "sec_1",
      author_character_id: "char_a",
      title: "问剑",
      body: "如何练快？",
      status: "visible",
      created_at: T0,
    });
    const on = await forum.toggleLike("acc_a", "post_1");
    expect(on).toEqual({ liked: true, likeCount: 1 });
    expect(state.likes).toHaveLength(1);
    const off = await forum.toggleLike("acc_a", "post_1");
    expect(off).toEqual({ liked: false, likeCount: 0 });
    expect(state.likes).toHaveLength(0);
    await expect(forum.toggleLike("acc_a", "post_nope")).rejects.toMatchObject({
      code: "post_not_found",
    });
  });

  it("举报：理由校验、目标可见性、成功入库", async () => {
    const { forum, state } = boot();
    state.posts.push({
      id: "post_1",
      section_id: "sec_1",
      author_character_id: "char_a",
      title: "问剑",
      body: "如何练快？",
      status: "visible",
      created_at: T0,
    });
    state.comments.push({
      id: "cmt_1",
      post_id: "post_1",
      author_character_id: "char_b",
      body: "好问题",
      status: "visible",
      created_at: T0,
    });
    await expect(
      forum.reportPost("acc_a", { targetType: "post", targetId: "post_1", reason: "" }),
    ).rejects.toMatchObject({ code: "invalid_reason" });
    await expect(
      forum.reportPost("acc_a", { targetType: "post", targetId: "post_nope", reason: "涉黄" }),
    ).rejects.toMatchObject({ code: "target_not_found" });

    await forum.reportPost("acc_a", { targetType: "post", targetId: "post_1", reason: "言辞不当" });
    await forum.reportPost("acc_b", { targetType: "comment", targetId: "cmt_1", reason: "引战" });
    expect(state.reports).toHaveLength(2);
    expect(state.reports[0]).toMatchObject({ target_type: "post", reason: "言辞不当" });
  });
});

describe("app 集成（forum 路由）", () => {
  it("公开读 + 鉴权写全链路：sections → posts → 发帖 → 评论 → 点赞 → 举报", async () => {
    const { db, state } = mockDb();
    state.characters.push({ id: "char_a", account_id: "acc_1", status: "active", name: "陆小风" });
    state.sections.push({ id: "sec_1", name: "江湖茶话", sort: 1 });
    const app = await createApp({ deps: { db }, inviteCodes: ["inv-1"] });
    await app.ready();

    const sections = await app.inject({ method: "GET", url: "/forum/sections" });
    expect(sections.statusCode).toBe(200);
    expect((sections.json() as unknown[]).length).toBe(1);

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { inviteCode: "inv-1" },
    });
    const { token } = login.json() as { token: string };

    const create = await app.inject({
      method: "POST",
      url: "/forum/posts",
      headers: { authorization: `Bearer ${token}` },
      payload: { sectionId: "sec_1", title: "问剑", body: "如何练快？" },
    });
    expect(create.statusCode).toBe(200);
    const post = create.json() as { id: string };

    const posts = await app.inject({ method: "GET", url: "/forum/posts" });
    expect((posts.json() as unknown[]).length).toBe(1);

    const detail = await app.inject({ method: "GET", url: `/forum/posts/${post.id}` });
    expect(detail.statusCode).toBe(200);

    const cmt = await app.inject({
      method: "POST",
      url: `/forum/posts/${post.id}/comments`,
      headers: { authorization: `Bearer ${token}` },
      payload: { body: "先练基本功" },
    });
    expect(cmt.statusCode).toBe(200);

    const like = await app.inject({
      method: "POST",
      url: "/forum/likes",
      headers: { authorization: `Bearer ${token}` },
      payload: { postId: post.id },
    });
    expect(like.statusCode).toBe(200);
    expect((like.json() as { liked: boolean }).liked).toBe(true);

    const report = await app.inject({
      method: "POST",
      url: "/forum/reports",
      headers: { authorization: `Bearer ${token}` },
      payload: { targetType: "post", targetId: post.id, reason: "引战" },
    });
    expect(report.statusCode).toBe(200);

    const badPost = await app.inject({
      method: "POST",
      url: "/forum/posts",
      headers: { authorization: `Bearer ${token}` },
      payload: { sectionId: "sec_1", title: "<b>", body: "x" },
    });
    expect(badPost.statusCode).toBe(400);
    expect((badPost.json() as { error: { code: string } }).error.code).toBe("invalid_content");
  });

  it("ForumError 类型存在（路由映射依赖）", () => {
    expect(ForumError).toBeDefined();
  });
});
