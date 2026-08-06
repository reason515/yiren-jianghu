import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS } from "./params.js";
import { createSeededRng } from "./random.js";
import {
  applySilver,
  balanceOf,
  buyItem,
  createShopState,
  rollDrops,
  sellItem,
  type DropDef,
  type Ledger,
} from "./economy.js";

const T0 = Date.UTC(2026, 7, 6, 0, 0, 0);

function ledger(): Ledger {
  return { entries: [] };
}

const DROPS: DropDef[] = [
  { itemId: "iron_sword", chance: 0.5, min: 1, max: 1 },
  { itemId: "silver_coin", chance: 1, min: 1, max: 3, minExp: 100 },
  { itemId: "herb", chance: 0.25, min: 1, max: 2 },
];

describe("applySilver（账本）", () => {
  it("入账/出账更新余额并记录流水（余额快照审计）", () => {
    let r = applySilver({
      ledger: ledger(),
      characterId: "c1",
      delta: 100,
      kind: "drop",
      reason: "击杀山贼",
      now: T0,
      entryId: "e1",
    });
    expect(r.ok).toBe(true);
    let l = r.ok ? r.ledger : ledger();
    expect(balanceOf(l)).toBe(100);
    expect(l.entries[0]?.balanceAfter).toBe(100);

    r = applySilver({
      ledger: l,
      characterId: "c1",
      delta: -30,
      kind: "buy",
      reason: "买药",
      now: T0 + 1000,
      entryId: "e2",
    });
    expect(r.ok).toBe(true);
    l = r.ok ? r.ledger : l;
    expect(balanceOf(l)).toBe(70);
    expect(l.entries[1]?.balanceAfter).toBe(70);
    expect(l.entries[1]?.kind).toBe("buy");
  });

  it("余额不足拒绝入账（不为负）", () => {
    const r = applySilver({
      ledger: ledger(),
      characterId: "c1",
      delta: -10,
      kind: "buy",
      reason: "买药",
      now: T0,
      entryId: "e1",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("insufficient_balance");
  });
});

describe("rollDrops（掉落表）", () => {
  it("确定性：同种子同输入 → 完全一致", () => {
    const a = rollDrops(createSeededRng(42), DROPS, 500);
    const b = rollDrops(createSeededRng(42), DROPS, 500);
    expect(a).toEqual(b);
  });

  it("min_exp 分级：低经验玩家不参与高门槛掉落", () => {
    const low = rollDrops(createSeededRng(1), DROPS, 50);
    expect(low.some((d) => d.itemId === "silver_coin")).toBe(false);
    const high = rollDrops(createSeededRng(1), DROPS, 200);
    // 同一随机序列下，高经验玩家可能多滚一项
    expect(high.length).toBeGreaterThanOrEqual(low.length);
  });

  it("数量落在 [min, max] 区间内", () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const d of rollDrops(createSeededRng(seed), DROPS, 500)) {
        const def = DROPS.find((x) => x.itemId === d.itemId)!;
        expect(d.count).toBeGreaterThanOrEqual(def.min);
        expect(d.count).toBeLessThanOrEqual(def.max);
      }
    }
  });
});

describe("商店（买入/卖出）", () => {
  it("买入扣款；余额不足或非法价格拒绝", () => {
    const state = createShopState(T0);
    const ok = buyItem({ state, price: 30, balance: 100, now: T0 });
    expect(ok).toEqual({ ok: true, state, balanceAfter: 70 });
    const poor = buyItem({ state, price: 30, balance: 10, now: T0 });
    expect(poor.ok).toBe(false);
    if (!poor.ok) expect(poor.reason).toBe("insufficient_balance");
    const bad = buyItem({ state, price: -1, balance: 100, now: T0 });
    expect(bad.ok).toBe(false);
  });

  it("卖出入账；全服每日现金流出超限 → cashflow_cap（防通胀，不静默失败）", () => {
    const state = createShopState(T0);
    const big = DEFAULT_PARAMS.economy.maxCashflowPerDay;
    const first = sellItem({ state, price: big, balance: 0, now: T0, params: DEFAULT_PARAMS });
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.balanceAfter).toBe(big);

    const second = sellItem({
      state: first.ok ? first.state : state,
      price: 1,
      balance: big,
      now: T0,
      params: DEFAULT_PARAMS,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("cashflow_cap");
  });

  it("跨天重置出金累计", () => {
    const state = createShopState(T0);
    const big = DEFAULT_PARAMS.economy.maxCashflowPerDay;
    const first = sellItem({ state, price: big, balance: 0, now: T0, params: DEFAULT_PARAMS });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const nextDay = T0 + 24 * 3_600_000;
    const second = sellItem({
      state: first.state,
      price: 1,
      balance: big,
      now: nextDay,
      params: DEFAULT_PARAMS,
    });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.state.day).toBe("2026-08-07");
  });
});
