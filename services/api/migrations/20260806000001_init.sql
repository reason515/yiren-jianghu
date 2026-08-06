-- 基线迁移：应用元信息表。
-- 领域表由 B1（领域模型与数据库表设计）逐表迁移引入。
CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO app_meta (key, value)
VALUES ('schema_version', '1')
ON CONFLICT (key) DO NOTHING;
