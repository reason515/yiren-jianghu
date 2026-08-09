/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.shorthands = undefined;

/** DC-041：激发图 + 已学招式/绝招。发布后可清空业务数据，无旧档保活。 */
exports.up = (pgm) => {
  pgm.addColumns("characters", {
    skill_enable: {
      type: "jsonb",
      notNull: true,
      default: pgm.func("'{}'::jsonb"),
    },
  });

  pgm.createTable("character_moves", {
    character_id: {
      type: "uuid",
      notNull: true,
      references: "characters",
      onDelete: "CASCADE",
    },
    move_id: { type: "text", notNull: true },
    learned_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
    },
  });
  pgm.addConstraint("character_moves", "character_moves_pkey", {
    primaryKey: ["character_id", "move_id"],
  });

  pgm.createTable("character_performs", {
    character_id: {
      type: "uuid",
      notNull: true,
      references: "characters",
      onDelete: "CASCADE",
    },
    perform_id: { type: "text", notNull: true },
    learned_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
    },
  });
  pgm.addConstraint("character_performs", "character_performs_pkey", {
    primaryKey: ["character_id", "perform_id"],
  });
};

exports.down = (pgm) => {
  pgm.dropTable("character_performs");
  pgm.dropTable("character_moves");
  pgm.dropColumns("characters", ["skill_enable"]);
};
