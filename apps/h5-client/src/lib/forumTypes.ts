/** 论坛数据（受控纯文本社区；服务端审核）。 */

export interface ForumSection {
  id: string;
  name: string;
  postCount: number;
}

export interface ForumPost {
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

export interface ForumComment {
  id: string;
  postId: string;
  body: string;
  authorName: string;
  createdAt: string;
}

export type ForumViewState = "sections" | "posts" | "post";

export interface ForumViewData {
  sections: ForumSection[];
  posts: ForumPost[];
  comments: ForumComment[];
}

export interface ForumPostInput {
  title: string;
  body: string;
}

export interface ForumCommentInput {
  body: string;
}
