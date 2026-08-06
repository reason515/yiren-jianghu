/**
 * 确定性伪随机数生成器（mulberry32）。
 * 同一 seed 产生完全相同的序列——PVP 可重演、单测可复现（game-core 护栏）。
 */

export type Rng = () => number;

export function createSeededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 以概率 p 判定是否发生（0 ≤ p ≤ 1）。 */
export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}

/** [min, max) 区间随机。 */
export function between(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}
