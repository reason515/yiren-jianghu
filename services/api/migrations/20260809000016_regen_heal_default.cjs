/** DC-044：last_heal_at 默认 now，并回填空值——避免新建角色永久跳过自然恢复。 */
exports.up = (pgm) => {
  pgm.sql("UPDATE characters SET last_heal_at = now() WHERE last_heal_at IS NULL");
  pgm.alterColumn("characters", "last_heal_at", {
    default: pgm.func("now()"),
  });
};

exports.down = (pgm) => {
  pgm.alterColumn("characters", "last_heal_at", {
    default: null,
  });
};
