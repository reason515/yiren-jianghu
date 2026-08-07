/**
 * F3-e2e 修复：复合主键缺失修复（幂等，新旧库皆可）。
 * 背景：0002/0004/0005 曾把 { primaryKey: [...] } 误当 createTable 第三参，
 * node-pg-migrate 会**静默忽略**该选项 → character_skills/pvp_scores/forum_likes
 * 一直无主键，ON CONFLICT (…) 抛 42P10（e2e 全链路抓出）。
 * 0002/0004/0005 源码已改为 pgm.addConstraint；本迁移用 DO 块条件补建，
 * 新库（已由修复后源码建好）跳过，旧库补上。
 */
exports.up = async (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'character_skills_pk') THEN
        ALTER TABLE character_skills ADD CONSTRAINT character_skills_pk PRIMARY KEY (character_id, skill_id);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pvp_scores_pk') THEN
        ALTER TABLE pvp_scores ADD CONSTRAINT pvp_scores_pk PRIMARY KEY (character_id, season_id);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'forum_likes_pk') THEN
        ALTER TABLE forum_likes ADD CONSTRAINT forum_likes_pk PRIMARY KEY (post_id, character_id);
      END IF;
    END $$;
  `);
};

exports.down = async (pgm) => {
  pgm.sql(`
    ALTER TABLE character_skills DROP CONSTRAINT IF EXISTS character_skills_pk;
    ALTER TABLE pvp_scores DROP CONSTRAINT IF EXISTS pvp_scores_pk;
    ALTER TABLE forum_likes DROP CONSTRAINT IF EXISTS forum_likes_pk;
  `);
};
