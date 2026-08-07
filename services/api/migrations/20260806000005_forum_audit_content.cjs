/**
 * B1-05：论坛（板块/帖/评论/点赞/举报）+ 审计事件 + 内容包版本记录。
 * 论坛为受控纯文本社区；举报队列供管理审核；audit_events 记录关键操作。
 */
exports.up = async (pgm) => {
  pgm.createTable("forum_sections", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    name: { type: "text", notNull: true },
    sort: { type: "integer", notNull: true, default: 0 },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createTable("forum_posts", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    section_id: {
      type: "uuid",
      notNull: true,
      references: "forum_sections(id)",
      onDelete: "RESTRICT",
    },
    author_character_id: { type: "uuid", notNull: true, references: "characters(id)" },
    title: { type: "text", notNull: true },
    body: { type: "text", notNull: true },
    status: { type: "text", notNull: true, default: "visible" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("forum_posts", "ck_post_status", {
    check: "status IN ('visible','hidden','deleted')",
  });
  pgm.createIndex("forum_posts", ["section_id", "status", "created_at"]);

  pgm.createTable("forum_comments", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    post_id: { type: "uuid", notNull: true, references: "forum_posts(id)", onDelete: "CASCADE" },
    author_character_id: { type: "uuid", notNull: true, references: "characters(id)" },
    body: { type: "text", notNull: true },
    status: { type: "text", notNull: true, default: "visible" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("forum_comments", "ck_comment_status", {
    check: "status IN ('visible','hidden','deleted')",
  });
  pgm.createIndex("forum_comments", ["post_id", "status", "created_at"]);

  pgm.createTable("forum_likes", {
    post_id: { type: "uuid", notNull: true, references: "forum_posts(id)", onDelete: "CASCADE" },
    character_id: {
      type: "uuid",
      notNull: true,
      references: "characters(id)",
      onDelete: "CASCADE",
    },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("forum_likes", "forum_likes_pk", {
    primaryKey: ["post_id", "character_id"],
  });

  pgm.createTable("forum_reports", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    target_type: { type: "text", notNull: true },
    target_id: { type: "uuid", notNull: true },
    reporter_character_id: { type: "uuid", notNull: true, references: "characters(id)" },
    reason: { type: "text", notNull: true, default: "" },
    status: { type: "text", notNull: true, default: "open" },
    handled_by: { type: "uuid" },
    handled_at: { type: "timestamptz" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("forum_reports", "ck_report_target", {
    check: "target_type IN ('post','comment')",
  });
  pgm.addConstraint("forum_reports", "ck_report_status", {
    check: "status IN ('open','resolved','dismissed')",
  });
  pgm.createIndex("forum_reports", ["status", "created_at"]);

  pgm.createTable("audit_events", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    account_id: { type: "uuid" },
    character_id: { type: "uuid" },
    action: { type: "text", notNull: true },
    payload: { type: "jsonb", notNull: true, default: pgm.func("'{}'::jsonb") },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("audit_events", ["character_id", "created_at"]);
  pgm.createIndex("audit_events", ["action", "created_at"]);

  pgm.createTable("content_versions", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    version: { type: "text", notNull: true, unique: true },
    name: { type: "text", notNull: true },
    status: { type: "text", notNull: true, default: "active" },
    loaded_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("content_versions", "ck_content_status", {
    check: "status IN ('active','rolled_back')",
  });
};

exports.down = async (pgm) => {
  pgm.dropTable("content_versions");
  pgm.dropTable("audit_events");
  pgm.dropTable("forum_reports");
  pgm.dropTable("forum_likes");
  pgm.dropTable("forum_comments");
  pgm.dropTable("forum_posts");
  pgm.dropTable("forum_sections");
};
