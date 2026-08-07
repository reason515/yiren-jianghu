import { useState, type JSX } from "react";
import { Chip } from "./base/Chip.js";
import type { SceneTradeResult } from "../lib/sceneTypes.js";

export interface ShopViewProps {
  data: SceneTradeResult;
  onBuy: (itemId: string) => void;
  onSell: (itemId: string) => void;
}

/** 场景内交易：商贩报价与行囊均由服务端快照提供，客户端只提交买卖意图。 */
export function ShopView({ data, onBuy, onSell }: ShopViewProps): JSX.Element {
  const [tab, setTab] = useState<"goods" | "inventory">("goods");
  return (
    <section className="shop" aria-label={`${data.vendor.name}的货架`}>
      <p className="shop-silver">囊中：{data.silver} 两银</p>
      <div className="scene-tabs" role="tablist" aria-label="交易内容">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "goods"}
          className={tab === "goods" ? "on" : ""}
          onClick={() => setTab("goods")}
        >
          货架
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "inventory"}
          className={tab === "inventory" ? "on" : ""}
          onClick={() => setTab("inventory")}
        >
          行囊
        </button>
      </div>
      {tab === "goods" ? (
        <div className="shop-list">
          {data.goods.map((item) => (
            <div className="shop-row" key={item.itemId}>
              <div>
                <strong>{item.name}</strong>
                <span>买入 {item.buy} 两</span>
              </div>
              <Chip
                label="买入"
                variant="action"
                disabled={item.buy <= 0 || data.silver < item.buy}
                onClick={() => onBuy(item.itemId)}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="shop-list">
          {data.inventory.length === 0 && <p className="scene-hint">行囊尚空。</p>}
          {data.inventory.map((item) => (
            <div className="shop-row" key={item.id}>
              <div>
                <strong>
                  {item.name} × {item.quantity}
                </strong>
                <span>
                  {item.equipped ? "佩在身上" : item.sell > 0 ? `可售 ${item.sell} 两` : "掌柜不收"}
                </span>
              </div>
              <Chip
                label="卖出"
                variant="action"
                disabled={item.equipped || item.sell <= 0}
                onClick={() => onSell(item.id)}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
