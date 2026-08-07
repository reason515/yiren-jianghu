/**
 * F0：手动 PVE 的可重演逐回合状态（DC-023）。
 * 已发布迁移只追加：state 固化双方战斗体、回合与 RNG 调用计数；事件仍按 seq 独立存储。
 */
exports.up = async (pgm) => {
  pgm.addColumn("combat_sessions", {
    state: { type: "jsonb", notNull: true, default: pgm.func("'{}'::jsonb") },
  });
  // 每名角色同一时刻仅能有一场未结束的手动 PVE，避免并发 action 写入不同分支。
  pgm.createIndex("combat_sessions", ["character_id"], {
    name: "uq_combat_sessions_character_ongoing_pve",
    unique: true,
    where: "kind = 'pve' AND status = 'ongoing'",
  });
};

exports.down = async (pgm) => {
  pgm.dropIndex("combat_sessions", ["character_id"], {
    name: "uq_combat_sessions_character_ongoing_pve",
  });
  pgm.dropColumn("combat_sessions", "state");
};
