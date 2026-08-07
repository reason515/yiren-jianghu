import type { JSX } from "react";
import { Chip } from "./base/Chip.js";
import { Sheet } from "./base/Sheet.js";
import type { ForumPost, ForumViewData, ForumViewState } from "../lib/forumTypes.js";

/** 论坛视图（受控纯文本社区：板块 → 帖子 → 详情；点赞/举报/发帖/评论动作）。 */
export interface ForumViewProps {
  data: ForumViewData;
  view: ForumViewState;
  activePost?: ForumPost;
  onOpenSection: (sectionId: string) => void;
  onOpenPost: (postId: string) => void;
  onBack: () => void;
  onLike: (postId: string) => void;
  onReportPost: (postId: string) => void;
  onReportComment: (commentId: string) => void;
  onComposePost: () => void;
  onComposeComment: () => void;
}

export function ForumView({
  data,
  view,
  activePost,
  onOpenSection,
  onOpenPost,
  onBack,
  onLike,
  onReportPost,
  onReportComment,
  onComposePost,
  onComposeComment,
}: ForumViewProps): JSX.Element {
  return (
    <div className="forum" data-testid="forum">
      {view === "sections" && (
        <div className="forum-sections">
          {data.sections.map((s) => (
            <button
              key={s.id}
              type="button"
              className="forum-section"
              onClick={() => onOpenSection(s.id)}
            >
              <span className="forum-section-name">{s.name}</span>
              <span className="forum-section-count">帖 {s.postCount}</span>
            </button>
          ))}
        </div>
      )}

      {view === "posts" && (
        <div className="forum-posts">
          <div className="forum-toolbar">
            <button type="button" className="forum-back" onClick={onBack}>
              ← 板块
            </button>
            <button type="button" className="forum-compose" onClick={onComposePost}>
              发帖
            </button>
          </div>
          {data.posts.map((p) => (
            <div className="forum-post-row" key={p.id}>
              <button type="button" className="forum-post-title" onClick={() => onOpenPost(p.id)}>
                {p.title}
              </button>
              <span className="forum-post-meta">
                {p.authorName} · {p.likeCount} 赞 · {p.commentCount} 评
              </span>
            </div>
          ))}
        </div>
      )}

      {view === "post" && activePost && (
        <div className="forum-post-detail">
          <button type="button" className="forum-back" onClick={onBack}>
            ← 帖子列表
          </button>
          <h3 className="forum-post-head">{activePost.title}</h3>
          <p className="forum-post-body">{activePost.body}</p>
          <p className="forum-post-meta">
            {activePost.authorName} · {activePost.createdAt}
          </p>
          <div className="chips">
            <Chip
              label={activePost.likedByMe ? "已赞" : "点赞"}
              variant="action"
              onClick={() => onLike(activePost.id)}
            />
            <Chip label="举报" variant="danger" onClick={() => onReportPost(activePost.id)} />
          </div>

          <div className="forum-comments">
            {data.comments.map((c) => (
              <div className="forum-comment" key={c.id}>
                <p className="forum-comment-body">{c.body}</p>
                <div className="forum-comment-meta">
                  <span>
                    {c.authorName} · {c.createdAt}
                  </span>
                  <button
                    type="button"
                    className="forum-report-link"
                    onClick={() => onReportComment(c.id)}
                  >
                    举报
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="forum-compose" onClick={onComposeComment}>
            回帖
          </button>
        </div>
      )}
    </div>
  );
}

export function ForumSheet({
  open,
  onClose,
  ...rest
}: ForumViewProps & { open: boolean; onClose: () => void }): JSX.Element | null {
  return (
    <Sheet open={open} title="江湖茶话" onClose={onClose}>
      <ForumView {...rest} />
    </Sheet>
  );
}
