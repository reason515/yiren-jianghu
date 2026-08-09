/**
 * DC-041：内容包感知的战斗体构造已下沉到 `@yjh/game-core`（api/worker 共用，避免公式漂移）。
 * 本文件保留作 re-export，维持既有导入路径与测试不变。
 */
export {
  buildCharacterCombatant,
  buildNpcCombatant,
  resolveEnableMap,
  type CharacterCombatSource,
} from "@yjh/game-core";
