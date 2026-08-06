/**
 * 基线迁移：应用元信息表。
 * 注意：node-pg-migrate 的 SQL 迁移不支持独立 .down.sql 文件（down 需与 up 同文件用注释段），
 * 因此本项目迁移统一使用 JS/CJS 格式（显式 up/down）。
 * 领域表由 B1（领域模型与数据库表设计）逐表迁移引入。
 */
exports.up = (pgm) => {
  pgm.createTable("app_meta", {
    key: { type: "text", primaryKey: true },
    value: { type: "text", notNull: true },
  });
  pgm.sql(
    "INSERT INTO app_meta (key, value) VALUES ('schema_version', '1') ON CONFLICT (key) DO NOTHING",
  );
};

exports.down = (pgm) => {
  pgm.dropTable("app_meta");
};
