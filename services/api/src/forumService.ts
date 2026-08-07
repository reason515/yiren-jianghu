import type { Db } from "./db.js";

/** 论坛域错误（code 进入错误信封）。 */
export class ForumError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ForumError";
  }
}

export interface ForumSectionView {
  id: string;
  name: string;
  postCount: number;
}

export interface ForumPostView {
  id: string;
  sectionId: string;
  title: string;
  body: string;
  authorName: string;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
}

export interface ForumCommentView {
  id: string;
  postId: string;
  body: string;
  authorName: string;
  createdAt: string;
}

export interface ForumService {
  sections(): Promise<ForumSectionView[]>;
  listPosts(sectionId?: string): Promise<ForumPostView[]>;
  getPost(postId: string): Promise<{ post: ForumPostView; comments: ForumCommentView[] } | null>;
  createPost(
    accountId: string,
    input: { sectionId: string; title: string; body: string },
  ): Promise<ForumPostView>;
  addComment(accountId: string, postId: string, body: string): Promise<ForumCommentView>;
  toggleLike(accountId: string, postId: string): Promise<{ liked: boolean; likeCount: number }>;
  reportPost(
    accountId: string,
    input: { targetType: "post" | "comment"; targetId: string; reason: string },
  ): Promise<{ ok: true }>;
}

export const POST_TITLE_MAX = 24;
export const POST_BODY_MAX = 500;
export const COMMENT_BODY_MAX = 200;
export const REPORT_REASON_MAX = 100;

/** 受控纯文本：拒绝排版/脚本字符（客户端渲染一律转义，服务端双重把关）。 */
function isPlainText(s: string): boolean {
  return !/[<>]/.test(s);
}

const DEFAULT_SECTIONS = [
  { name: "江湖茶话", sort: 1 },
  { name: "武林见闻", sort: 2 },
  { name: "悬赏与恩怨", sort: 3 },
];

export function createForumService(db: Db): ForumService {
  const activeCharacter = async (
    accountId: string,
  ): Promise<{ id: string; name: string } | null> => {
    const rows = await db.query<{ id: string; name: string }>(
      "SELECT id, name FROM characters WHERE account_id = $1 AND status = 'active'",
      [accountId],
    );
    return rows.rows[0] ?? null;
  };

  const sectionExists = async (sectionId: string): Promise<boolean> => {
    const rows = await db.query<{ id: string }>("SELECT id FROM forum_sections WHERE id = $1", [
      sectionId,
    ]);
    return Boolean(rows.rows[0]);
  };

  const postVisible = async (postId: string): Promise<boolean> => {
    const rows = await db.query<{ id: string }>(
      "SELECT id FROM forum_posts WHERE id = $1 AND status = 'visible'",
      [postId],
    );
    return Boolean(rows.rows[0]);
  };

  const ensureSections = async (): Promise<void> => {
    const count = await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM forum_sections",
      [],
    );
    if (Number(count.rows[0]?.n ?? 0) > 0) return;
    for (const s of DEFAULT_SECTIONS) {
      await db.query("INSERT INTO forum_sections (name, sort) VALUES ($1, $2)", [s.name, s.sort]);
    }
  };

  return {
    async sections() {
      await ensureSections();
      const rows = await db.query<{
        id: string;
        name: string;
        post_count: number;
      }>(
        "SELECT s.id, s.name, (SELECT count(*)::int FROM forum_posts p WHERE p.section_id = s.id AND p.status = 'visible') AS post_count FROM forum_sections s ORDER BY s.sort ASC",
        [],
      );
      return rows.rows.map((r) => ({ id: r.id, name: r.name, postCount: r.post_count }));
    },

    async listPosts(sectionId) {
      const rows = await db.query<{
        id: string;
        section_id: string;
        title: string;
        body: string;
        created_at: string;
        author_name: string;
        like_count: number;
        comment_count: number;
      }>(
        "SELECT p.id, p.section_id, p.title, p.body, p.created_at, c.name AS author_name, (SELECT count(*)::int FROM forum_likes l WHERE l.post_id = p.id) AS like_count, (SELECT count(*)::int FROM forum_comments cm WHERE cm.post_id = p.id AND cm.status = 'visible') AS comment_count FROM forum_posts p JOIN characters c ON c.id = p.author_character_id WHERE p.status = 'visible' AND ($1::uuid IS NULL OR p.section_id = $1) ORDER BY p.created_at DESC LIMIT 50",
        [sectionId ?? null],
      );
      return rows.rows.map((r) => ({
        id: r.id,
        sectionId: r.section_id,
        title: r.title,
        body: r.body,
        authorName: r.author_name,
        createdAt: r.created_at,
        likeCount: r.like_count,
        likedByMe: false, // 公开视图不携带身份；鉴权后的个人态在 E 阶段客户端自行补充
        commentCount: r.comment_count,
      }));
    },

    async getPost(postId) {
      const rows = await db.query<{
        id: string;
        section_id: string;
        title: string;
        body: string;
        created_at: string;
        author_name: string;
        like_count: number;
        comment_count: number;
      }>(
        "SELECT p.id, p.section_id, p.title, p.body, p.created_at, c.name AS author_name, (SELECT count(*)::int FROM forum_likes l WHERE l.post_id = p.id) AS like_count, (SELECT count(*)::int FROM forum_comments cm WHERE cm.post_id = p.id AND cm.status = 'visible') AS comment_count FROM forum_posts p JOIN characters c ON c.id = p.author_character_id WHERE p.id = $1 AND p.status = 'visible'",
        [postId],
      );
      const row = rows.rows[0];
      if (!row) return null;

      const comments = await db.query<{
        id: string;
        post_id: string;
        body: string;
        created_at: string;
        author_name: string;
      }>(
        "SELECT cm.id, cm.post_id, cm.body, cm.created_at, c.name AS author_name FROM forum_comments cm JOIN characters c ON c.id = cm.author_character_id WHERE cm.post_id = $1 AND cm.status = 'visible' ORDER BY cm.created_at ASC",
        [postId],
      );
      return {
        post: {
          id: row.id,
          sectionId: row.section_id,
          title: row.title,
          body: row.body,
          authorName: row.author_name,
          createdAt: row.created_at,
          likeCount: row.like_count,
          likedByMe: false,
          commentCount: row.comment_count,
        },
        comments: comments.rows.map((c) => ({
          id: c.id,
          postId: c.post_id,
          body: c.body,
          authorName: c.author_name,
          createdAt: c.created_at,
        })),
      };
    },

    async createPost(accountId, input) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new ForumError("no_character", "尚未立名闯江湖");
      const title = input.title.trim();
      const body = input.body.trim();
      if (!title || [...title].length > POST_TITLE_MAX) {
        throw new ForumError("invalid_title", `标题须为 1–${POST_TITLE_MAX} 字`);
      }
      if (!body || [...body].length > POST_BODY_MAX) {
        throw new ForumError("invalid_body", `正文须为 1–${POST_BODY_MAX} 字`);
      }
      if (!isPlainText(title) || !isPlainText(body)) {
        throw new ForumError("invalid_content", "江湖规矩：只收纯文字，不收排版符");
      }
      if (!(await sectionExists(input.sectionId))) {
        throw new ForumError("section_not_found", "此地无此坊");
      }
      const created = await db.query<{
        id: string;
        section_id: string;
        title: string;
        body: string;
        created_at: string;
      }>(
        "INSERT INTO forum_posts (section_id, author_character_id, title, body) VALUES ($1, $2, $3, $4) RETURNING id, section_id, title, body, created_at",
        [input.sectionId, ch.id, title, body],
      );
      const row = created.rows[0]!;
      return {
        id: row.id,
        sectionId: row.section_id,
        title: row.title,
        body: row.body,
        authorName: ch.name,
        createdAt: row.created_at,
        likeCount: 0,
        likedByMe: false,
        commentCount: 0,
      };
    },

    async addComment(accountId, postId, body) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new ForumError("no_character", "尚未立名闯江湖");
      const text = body.trim();
      if (!text || [...text].length > COMMENT_BODY_MAX) {
        throw new ForumError("invalid_body", `回帖须为 1–${COMMENT_BODY_MAX} 字`);
      }
      if (!isPlainText(text)) {
        throw new ForumError("invalid_content", "江湖规矩：只收纯文字，不收排版符");
      }
      if (!(await postVisible(postId))) {
        throw new ForumError("post_not_found", "这帖子已随风而去");
      }
      const created = await db.query<{ id: string; post_id: string; created_at: string }>(
        "INSERT INTO forum_comments (post_id, author_character_id, body) VALUES ($1, $2, $3) RETURNING id, post_id, created_at",
        [postId, ch.id, text],
      );
      const row = created.rows[0]!;
      return {
        id: row.id,
        postId: row.post_id,
        body: text,
        authorName: ch.name,
        createdAt: row.created_at,
      };
    },

    async toggleLike(accountId, postId) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new ForumError("no_character", "尚未立名闯江湖");
      if (!(await postVisible(postId))) {
        throw new ForumError("post_not_found", "这帖子已随风而去");
      }
      const existing = await db.query<{ post_id: string }>(
        "SELECT post_id FROM forum_likes WHERE post_id = $1 AND character_id = $2",
        [postId, ch.id],
      );
      let liked: boolean;
      if (existing.rows[0]) {
        await db.query("DELETE FROM forum_likes WHERE post_id = $1 AND character_id = $2", [
          postId,
          ch.id,
        ]);
        liked = false;
      } else {
        await db.query("INSERT INTO forum_likes (post_id, character_id) VALUES ($1, $2)", [
          postId,
          ch.id,
        ]);
        liked = true;
      }
      const count = await db.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM forum_likes WHERE post_id = $1",
        [postId],
      );
      return { liked, likeCount: Number(count.rows[0]?.n ?? 0) };
    },

    async reportPost(accountId, input) {
      const ch = await activeCharacter(accountId);
      if (!ch) throw new ForumError("no_character", "尚未立名闯江湖");
      const reason = input.reason.trim();
      if (!reason || [...reason].length > REPORT_REASON_MAX) {
        throw new ForumError("invalid_reason", `举报理由须为 1–${REPORT_REASON_MAX} 字`);
      }
      const targetOk =
        input.targetType === "post"
          ? await postVisible(input.targetId)
          : (
              await db.query<{ id: string }>(
                "SELECT id FROM forum_comments WHERE id = $1 AND status = 'visible'",
                [input.targetId],
              )
            ).rows.length > 0;
      if (!targetOk) throw new ForumError("target_not_found", "所举之物已不在江湖");

      await db.query(
        "INSERT INTO forum_reports (target_type, target_id, reporter_character_id, reason) VALUES ($1, $2, $3, $4)",
        [input.targetType, input.targetId, ch.id, reason],
      );
      return { ok: true };
    },
  };
}
