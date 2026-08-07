/*
 * E14.1 场景交互：
 * - 房间静态物品按角色记录拾取状态，防止重复拾取；
 * - 商店每日回收额记录，兑现 C9 的现金流出上限。
 */
exports.up = (pgm) => {
  pgm.createTable("character_room_items", {
    character_id: {
      type: "uuid",
      notNull: true,
      references: "characters",
      onDelete: "CASCADE",
    },
    room_id: { type: "text", notNull: true },
    item_def_id: { type: "text", notNull: true },
    taken_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("character_room_items", "pk_character_room_items", {
    primaryKey: ["character_id", "room_id", "item_def_id"],
  });

  pgm.createTable("shop_cashflows", {
    vendor_id: { type: "text", notNull: true },
    day: { type: "date", notNull: true },
    sell_received: { type: "bigint", notNull: true, default: 0 },
  });
  pgm.addConstraint("shop_cashflows", "pk_shop_cashflows", {
    primaryKey: ["vendor_id", "day"],
  });
  pgm.addConstraint("shop_cashflows", "ck_shop_cashflows_received", {
    check: "sell_received >= 0",
  });
};

exports.down = (pgm) => {
  pgm.dropTable("shop_cashflows");
  pgm.dropTable("character_room_items");
};
