/**
 * DC-040：角色门派辈分。
 * generation 越小越尊；拜师后 = 师父 generation + 1。
 */
exports.up = async (pgm) => {
  pgm.addColumns("characters", {
    generation: { type: "integer" },
  });
};

exports.down = async (pgm) => {
  pgm.dropColumns("characters", ["generation"]);
};
