import type { GameParams } from "./params.js";
import { dayKey } from "./afk.js";
import type { Rng } from "./random.js";

/**
 * C9 经济与掉落（银两单一货币）。
 *
 * - 银两账本：每次变动记流水（来源/去向 + 余额快照），可审计；余额不为负。
 * - 掉落表：概率 + min_exp 分级 + 数量区间，经 seeded RNG → 确定性可复现（PVP 战报同源）。
 * - 商店：买入花银两（入金不设上限）、卖出入账（出金受每日现金流出上限约束，防通胀——
 *   吸收 xkx moneyd MAX_CASHFLOW_ALLOWED 教训：全服出金超限时卖出应被明确拒绝而非静默失败）。
 */

// ---------- 银两账本 ----------

export type SilverKind =
  "drop" | "quest_reward" | "afk_gain" | "sell" | "buy" | "recover" | "refund" | "gm";

export interface SilverEntry {
  id: string;
  characterId: string;
  /** 正入负出。 */
  delta: number;
  kind: SilverKind;
  reason: string;
  balanceAfter: number;
  createdAt: number;
}

export interface Ledger {
  entries: SilverEntry[];
}

export function balanceOf(ledger: Ledger): number {
  return ledger.entries.reduce((acc, e) => acc + e.delta, 0);
}

export type ApplySilverResult =
  | { ok: true; ledger: Ledger; balanceAfter: number }
  | { ok: false; reason: "insufficient_balance" };

export function applySilver(input: {
  ledger: Ledger;
  characterId: string;
  delta: number;
  kind: SilverKind;
  reason: string;
  now: number;
  entryId: string;
}): ApplySilverResult {
  const before = balanceOf(input.ledger);
  const after = before + input.delta;
  if (after < 0) return { ok: false, reason: "insufficient_balance" };
  const entry: SilverEntry = {
    id: input.entryId,
    characterId: input.characterId,
    delta: input.delta,
    kind: input.kind,
    reason: input.reason,
    balanceAfter: after,
    createdAt: input.now,
  };
  return { ok: true, ledger: { entries: [...input.ledger.entries, entry] }, balanceAfter: after };
}

// ---------- 掉落表 ----------

export interface DropDef {
  itemId: string;
  chance: number;
  min: number;
  max: number;
  /** 掉落按玩家经验分级：低于 minExp 不参与本掉落。 */
  minExp?: number;
}

export interface RollResult {
  itemId: string;
  count: number;
}

/** 按概率与数量区间掷掉落（seeded 确定性；经验门槛先过滤）。 */
export function rollDrops(rng: Rng, drops: DropDef[], playerExp: number): RollResult[] {
  const out: RollResult[] = [];
  for (const drop of drops) {
    if (drop.minExp !== undefined && playerExp < drop.minExp) continue;
    if (rng() >= drop.chance) continue;
    const count = drop.min + Math.floor(rng() * (drop.max - drop.min + 1));
    out.push({ itemId: drop.itemId, count });
  }
  return out;
}

// ---------- 商店 ----------

export interface ShopState {
  day: string;
  /** 本日出金（卖出返给玩家）累计，受 maxCashflowPerDay 约束。 */
  sellReceived: number;
}

export function createShopState(now: number): ShopState {
  return { day: dayKey(now), sellReceived: 0 };
}

function rollState(state: ShopState, now: number): ShopState {
  return state.day === dayKey(now) ? state : { day: dayKey(now), sellReceived: 0 };
}

export type BuyResult =
  | { ok: true; state: ShopState; balanceAfter: number }
  | { ok: false; reason: "insufficient_balance" | "invalid_price" };

export function buyItem(input: {
  state: ShopState;
  price: number;
  balance: number;
  now: number;
}): BuyResult {
  if (!Number.isFinite(input.price) || input.price < 0)
    return { ok: false, reason: "invalid_price" };
  if (input.balance < input.price) return { ok: false, reason: "insufficient_balance" };
  return {
    ok: true,
    state: rollState(input.state, input.now),
    balanceAfter: input.balance - input.price,
  };
}

export type SellResult =
  | { ok: true; state: ShopState; balanceAfter: number }
  | { ok: false; reason: "cashflow_cap" | "invalid_price" };

export function sellItem(input: {
  state: ShopState;
  price: number;
  balance: number;
  now: number;
  params: GameParams;
}): SellResult {
  if (!Number.isFinite(input.price) || input.price < 0)
    return { ok: false, reason: "invalid_price" };
  const state = rollState(input.state, input.now);
  const nextReceived = state.sellReceived + input.price;
  if (nextReceived > input.params.economy.maxCashflowPerDay) {
    return { ok: false, reason: "cashflow_cap" };
  }
  return {
    ok: true,
    state: { day: state.day, sellReceived: nextReceived },
    balanceAfter: input.balance + input.price,
  };
}
