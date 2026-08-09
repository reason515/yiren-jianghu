import type { ContentPack } from "./schema.js";

/**
 * 内容包校验器（A6）：结构（zod）+ 引用完整性。
 * 返回 issue 列表；severity: "error" | "warning"。
 */

export interface ContentIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
}

function dup(list: unknown[], label: string): ContentIssue[] {
  const seen = new Set<string>();
  const issues: ContentIssue[] = [];
  for (const item of list as { id?: unknown }[]) {
    const key = typeof item?.id === "string" ? item.id : "";
    if (!key) continue;
    if (seen.has(key)) {
      issues.push({
        code: "duplicate_id",
        severity: "error",
        message: `${label} 存在重复 id：${key}`,
      });
    }
    seen.add(key);
  }
  return issues;
}

export function validateContentPack(pack: ContentPack): ContentIssue[] {
  const issues: ContentIssue[] = [];

  const roomIds = new Set(pack.rooms.map((r) => r.id));
  const npcIds = new Set(pack.npcs.map((n) => n.id));
  const itemIds = new Set(pack.items.map((i) => i.id));
  const skillIds = new Set(pack.skills.map((s) => s.id));
  const questIds = new Set(pack.quests.map((q) => q.id));

  issues.push(...dup(pack.rooms, "rooms"));
  issues.push(...dup(pack.npcs, "npcs"));
  issues.push(...dup(pack.items, "items"));
  issues.push(...dup(pack.skills, "skills"));
  issues.push(...dup(pack.performs, "performs"));
  issues.push(...dup(pack.quests, "quests"));
  issues.push(...dup(pack.story, "story"));

  // 房间
  const oneWayReported = new Set<string>();
  const roomsById = new Map(pack.rooms.map((room) => [room.id, room]));
  for (const room of pack.rooms) {
    for (const exit of room.exits) {
      if (!roomIds.has(exit.roomId)) {
        issues.push({
          code: "broken_exit",
          severity: "error",
          message: `房间 ${room.id} 出口 ${exit.dir} 指向不存在的房间 ${exit.roomId}`,
        });
        continue;
      }
      const target = roomsById.get(exit.roomId);
      const hasReturn = target?.exits.some((candidate) => candidate.roomId === room.id) ?? false;
      if (!hasReturn) {
        const key = [room.id, exit.roomId].sort().join("|");
        if (!oneWayReported.has(key)) {
          oneWayReported.add(key);
          issues.push({
            code: "one_way_exit",
            severity: "warning",
            message: `房间 ${room.id} → ${exit.roomId}（${exit.dir}）无回程出口`,
          });
        }
      }
    }
    for (const npcId of room.npcIds) {
      if (!npcIds.has(npcId)) {
        issues.push({
          code: "broken_npc_ref",
          severity: "error",
          message: `房间 ${room.id} 引用不存在 NPC ${npcId}`,
        });
      }
    }
    for (const itemId of room.itemIds) {
      if (!itemIds.has(itemId)) {
        issues.push({
          code: "broken_item_ref",
          severity: "error",
          message: `房间 ${room.id} 引用不存在物品 ${itemId}`,
        });
      }
    }
  }

  // NPC
  for (const npc of pack.npcs) {
    for (const ref of npc.skills) {
      if (!skillIds.has(ref.skillId)) {
        issues.push({
          code: "broken_skill_ref",
          severity: "error",
          message: `NPC ${npc.id} 引用不存在技能 ${ref.skillId}`,
        });
      }
    }
    for (const good of npc.goods) {
      if (!itemIds.has(good.itemId)) {
        issues.push({
          code: "broken_goods_ref",
          severity: "error",
          message: `NPC ${npc.id} 商店库存引用不存在物品 ${good.itemId}`,
        });
      }
      if (good.buy < good.sell) {
        issues.push({
          code: "goods_price_inverted",
          severity: "warning",
          message: `NPC ${npc.id} 商品 ${good.itemId} 买入价低于卖出价（倒贴）`,
        });
      }
    }
    for (const drop of npc.drops) {
      if (!itemIds.has(drop.itemId)) {
        issues.push({
          code: "broken_drop_ref",
          severity: "error",
          message: `NPC ${npc.id} 掉落引用不存在物品 ${drop.itemId}`,
        });
      }
      if (drop.max < drop.min) {
        issues.push({
          code: "drop_range",
          severity: "error",
          message: `NPC ${npc.id} 掉落 ${drop.itemId} max < min`,
        });
      }
    }
    if (npc.aggressive && npc.kind !== "battle") {
      issues.push({
        code: "aggressive_non_battle",
        severity: "warning",
        message: `NPC ${npc.id} 标记主动攻击但类型非 battle`,
      });
    }
  }

  // 绝招
  for (const perform of pack.performs) {
    if (!skillIds.has(perform.skillId)) {
      issues.push({
        code: "broken_perform_skill",
        severity: "error",
        message: `绝招 ${perform.id} 引用不存在技能 ${perform.skillId}`,
      });
    }
    if (perform.effect.type === "buff") {
      issues.push({
        code: "perform_buff_unsupported",
        severity: "warning",
        message: `绝招 ${perform.id} 为 buff 类型，v1 战斗引擎未实现（保留 Schema，后续版本支持）`,
      });
    }
  }

  // 任务
  for (const quest of pack.quests) {
    for (const phase of quest.phases) {
      switch (phase.type) {
        case "goto":
          if (!roomIds.has(phase.targetId)) {
            issues.push({
              code: "broken_quest_room",
              severity: "error",
              message: `任务 ${quest.id} goto 指向不存在房间 ${phase.targetId}`,
            });
          }
          break;
        case "kill":
        case "talk":
          if (!npcIds.has(phase.targetId)) {
            issues.push({
              code: "broken_quest_npc",
              severity: "error",
              message: `任务 ${quest.id} ${phase.type} 指向不存在 NPC ${phase.targetId}`,
            });
          }
          break;
        case "deliver":
        case "collect":
          if (!itemIds.has(phase.targetId)) {
            issues.push({
              code: "broken_quest_item",
              severity: "error",
              message: `任务 ${quest.id} ${phase.type} 指向不存在物品 ${phase.targetId}`,
            });
          }
          break;
      }
    }
    for (const reward of quest.rewards.items) {
      if (!itemIds.has(reward.itemId)) {
        issues.push({
          code: "broken_reward_item",
          severity: "error",
          message: `任务 ${quest.id} 奖励引用不存在物品 ${reward.itemId}`,
        });
      }
    }
    if (quest.kind === "main" && !quest.repeatable) {
      // 主线任务允许一次性，无告警
    }
  }

  // 主线节点
  for (const node of pack.story) {
    if (node.questId && !questIds.has(node.questId)) {
      issues.push({
        code: "broken_story_quest",
        severity: "error",
        message: `主线节点 ${node.id} 引用不存在任务 ${node.questId}`,
      });
    }
    for (const next of node.next) {
      if (!pack.story.some((s) => s.id === next)) {
        issues.push({
          code: "broken_story_next",
          severity: "error",
          message: `主线节点 ${node.id} 指向不存在节点 ${next}`,
        });
      }
    }
  }

  // 天下图：节点 id = rooms.area；道路两端须落在节点上
  if (pack.worldMap) {
    const areas = new Set(pack.rooms.map((r) => r.area));
    const nodeIds = new Set(pack.worldMap.nodes.map((n) => n.id));
    for (const node of pack.worldMap.nodes) {
      if (!areas.has(node.id)) {
        issues.push({
          code: "world_unknown_area",
          severity: "error",
          message: `天下图节点 ${node.id} 无对应房间 area`,
        });
      }
    }
    for (const area of areas) {
      if (!nodeIds.has(area)) {
        issues.push({
          code: "world_missing_area",
          severity: "warning",
          message: `房间 area「${area}」未登记于天下图`,
        });
      }
    }
    for (const road of pack.worldMap.roads) {
      if (!nodeIds.has(road.from) || !nodeIds.has(road.to)) {
        issues.push({
          code: "broken_world_road",
          severity: "error",
          message: `天下图道路 ${road.from}→${road.to} 引用不存在节点`,
        });
      }
    }
  }

  // 参数边界
  const { afk } = pack.params;
  if (afk.maxDurationHours < 1 || afk.maxDurationHours > 12) {
    issues.push({
      code: "param_afk_duration",
      severity: "warning",
      message: `挂机时长上限 ${afk.maxDurationHours}h 超出建议区间 1–12h`,
    });
  }

  return issues;
}

export function hasErrors(issues: ContentIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}
