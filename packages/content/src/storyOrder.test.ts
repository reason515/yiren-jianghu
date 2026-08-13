import { describe, expect, it } from "vitest";
import { orderStoryByNextChain } from "./storyOrder.js";

describe("orderStoryByNextChain", () => {
  it("按 next 链从根排序，不按文件名", () => {
    const nodes = [
      { id: "s_arrive_city", title: "入城", next: [] as string[] },
      { id: "s_begin", title: "初入江湖", next: ["s_learn"] },
      { id: "s_learn", title: "拜师学艺", next: ["s_graduate"] },
      { id: "s_graduate", title: "出村", next: ["s_arrive_city"] },
      { id: "s_join_sect", title: "拜入玄门", next: [] as string[] },
    ];
    expect(orderStoryByNextChain(nodes).map((n) => n.id)).toEqual([
      "s_begin",
      "s_learn",
      "s_graduate",
      "s_arrive_city",
      "s_join_sect",
    ]);
  });

  it("空数组原样返回", () => {
    expect(orderStoryByNextChain([])).toEqual([]);
  });
});
