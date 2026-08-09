/**
 * DC-039：师徒字段 + 建角起步银。
 * master_npc_id / sect_id：正式拜师落库；收费请教不写。
 * 建角银两默认 10，保证未打怪也可请教数次。
 */
exports.up = async (pgm) => {
  pgm.addColumns("characters", {
    master_npc_id: { type: "text" },
    sect_id: { type: "text" },
  });
  pgm.alterColumn("characters", "silver", { default: 10 });
};

exports.down = async (pgm) => {
  pgm.alterColumn("characters", "silver", { default: 0 });
  pgm.dropColumns("characters", ["master_npc_id", "sect_id"]);
};
