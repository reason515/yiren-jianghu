// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ShopView } from "./ShopView.js";

const DATA = {
  kind: "trade" as const,
  vendor: { id: "general_shop", name: "杂货铺掌柜" },
  silver: 3,
  goods: [{ itemId: "dry_food", name: "干粮", kind: "food", buy: 1, sell: 0 }],
  inventory: [{ id: "ci_1", name: "布鞋", kind: "armor", quantity: 1, equipped: false, sell: 1 }],
};

describe("ShopView（场景交易）", () => {
  it("展示银两与货架；买入/卖出只回传服务端所需的物品实例或定义", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const bought: string[] = [];
    const sold: string[] = [];
    act(() =>
      createRoot(host).render(
        <ShopView data={DATA} onBuy={(id) => bought.push(id)} onSell={(id) => sold.push(id)} />,
      ),
    );

    expect(host.textContent).toContain("囊中：3 两银");
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>(".chip")]
        .find((button) => button.textContent === "买入")!
        .click(),
    );
    expect(bought).toEqual(["dry_food"]);

    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>("[role=tab]")]
        .find((button) => button.textContent === "行囊")!
        .click(),
    );
    expect(host.textContent).toContain("布鞋 × 1");
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>(".chip")]
        .find((button) => button.textContent === "卖出")!
        .click(),
    );
    expect(sold).toEqual(["ci_1"]);
  });
});
