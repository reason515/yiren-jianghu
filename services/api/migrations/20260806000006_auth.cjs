/**
 * M2.5-auth：账号邀请码绑定 + 会话表。
 * accounts.invite_code：同一邀请码幂等登录到同一账号（NULL 不参与唯一约束）。
 * sessions：Bearer token（32 hex）→ account，可过期可撤销。
 */
exports.up = async (pgm) => {
  pgm.addColumn("accounts", {
    invite_code: { type: "text" },
  });
  pgm.createIndex("accounts", ["invite_code"], { unique: true });

  pgm.createTable("sessions", {
    token: { type: "text", primaryKey: true },
    account_id: { type: "uuid", notNull: true, references: "accounts(id)", onDelete: "CASCADE" },
    expires_at: { type: "timestamptz", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("sessions", ["account_id"]);
};

exports.down = async (pgm) => {
  pgm.dropTable("sessions");
  pgm.dropIndex("accounts", ["invite_code"]);
  pgm.dropColumn("accounts", "invite_code");
};
