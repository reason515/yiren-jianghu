/*
 * 自动行侠资格：首次手动完成并交差后永久解锁该任务。
 * 保留在任务记录上，重复任务重接时不会丢失历史资格。
 */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn("character_quests", {
    auto_unlocked_at: { type: "timestamptz", notNull: false },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn("character_quests", "auto_unlocked_at");
};
