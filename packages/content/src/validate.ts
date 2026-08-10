import type { ContentPack } from "./schema.js";
import { KNOWN_ENTITY_INDEX_PATHS, compileMechanics, type MechanicsConfig } from "./mechanics.js";

/**
 * 内容包校验器（A6 / DC-046）：结构（zod）+ 引用完整性 + 机制公式。
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

export function validateContentPack(
  pack: ContentPack & { mechanics?: MechanicsConfig },
): ContentIssue[] {
  const issues: ContentIssue[] = [];

  if (pack.mechanics) {
    const compiled = compileMechanics(pack.mechanics);
    if (!compiled.ok) {
      for (const err of compiled.errors) {
        issues.push({ code: "mechanics_compile", severity: "error", message: err });
      }
    } else {
      for (const [key, entry] of Object.entries(compiled.mechanics.entityIndex)) {
        if (!KNOWN_ENTITY_INDEX_PATHS.has(entry.path)) {
          issues.push({
            code: "entity_index_unknown_path",
            severity: "error",
            message: `entityIndex.${key} 未知路径：${entry.path}`,
          });
        }
      }
    }
  }

  const roomIds = new Set(pack.rooms.map((r) => r.id));
  const npcIds = new Set(pack.npcs.map((n) => n.id));
  const itemIds = new Set(pack.items.map((i) => i.id));
  const skillIds = new Set(pack.skills.map((s) => s.id));
  const questIds = new Set(pack.quests.map((q) => q.id));

  issues.push(...dup(pack.rooms, "rooms"));
  issues.push(...dup(pack.npcs, "npcs"));
  issues.push(...dup(pack.items, "items"));
  issues.push(...dup(pack.skills, "skills"));
  issues.push(...dup(pack.moves ?? [], "moves"));
  issues.push(...dup(pack.performs, "performs"));
  issues.push(...dup(pack.quests, "quests"));
  issues.push(...dup(pack.story, "story"));
  issues.push(...dup(pack.rumors ?? [], "rumors"));
  issues.push(...dup(pack.grindJobs ?? [], "grindJobs"));

  // 技能（DC-041）
  for (const skill of pack.skills) {
    if (skill.kind === "basic") {
      if (skill.enableSlots.length > 0) {
        issues.push({
          code: "basic_skill_enable_slots",
          severity: "error",
          message: `基本功 ${skill.id} 不得配置 enableSlots`,
        });
      }
      if (skill.category === "knowledge") {
        issues.push({
          code: "basic_knowledge",
          severity: "error",
          message: `knowledge 不可作基本功：${skill.id}`,
        });
      }
    } else if (skill.category === "knowledge" && skill.enableSlots.length > 0) {
      issues.push({
        code: "knowledge_enable_slots",
        severity: "error",
        message: `道学类特殊功 ${skill.id} 不可激发`,
      });
    } else if (skill.category !== "knowledge" && skill.enableSlots.length === 0) {
      issues.push({
        code: "special_no_enable_slots",
        severity: "warning",
        message: `特殊功 ${skill.id} 未配置 enableSlots（无法激发进战斗）`,
      });
    }
  }

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
    for (const teach of npc.teaches ?? []) {
      if (!skillIds.has(teach.skillId)) {
        issues.push({
          code: "broken_teach_ref",
          severity: "error",
          message: `NPC ${npc.id} teaches 引用不存在技能 ${teach.skillId}`,
        });
      }
    }
    if (npc.kind === "tuition_teacher" && (npc.teaches?.length ?? 0) === 0) {
      issues.push({
        code: "tuition_teacher_no_teaches",
        severity: "error",
        message: `NPC ${npc.id} 为 tuition_teacher 但未配置 teaches`,
      });
    }
    if (npc.kind === "apprentice_master" && !npc.sectId) {
      issues.push({
        code: "apprentice_master_no_sect",
        severity: (npc.teaches?.length ?? 0) > 0 ? "error" : "warning",
        message:
          (npc.teaches?.length ?? 0) > 0
            ? `NPC ${npc.id} 可传功（有 teaches）但未配置 sectId`
            : `NPC ${npc.id} 为 apprentice_master 但未配置 sectId（无法拜师落库）`,
      });
    }
    if (npc.kind === "apprentice_master" && npc.sectId && npc.generation == null) {
      issues.push({
        code: "apprentice_master_no_generation",
        severity: "error",
        message: `NPC ${npc.id} 为 apprentice_master 但未配置 generation（DC-040）`,
      });
    }
    for (const req of npc.recruit?.minSkills ?? []) {
      if (!skillIds.has(req.skillId)) {
        issues.push({
          code: "broken_recruit_skill",
          severity: "error",
          message: `NPC ${npc.id} recruit.minSkills 引用不存在技能 ${req.skillId}`,
        });
      }
    }
    if (npc.skillEnable) {
      for (const [slot, skillId] of Object.entries(npc.skillEnable)) {
        if (!skillIds.has(skillId)) {
          issues.push({
            code: "broken_skill_enable",
            severity: "error",
            message: `NPC ${npc.id} skillEnable.${slot} 引用不存在技能 ${skillId}`,
          });
          continue;
        }
        const sk = pack.skills.find((s) => s.id === skillId);
        if (sk && !sk.enableSlots.includes(slot as (typeof sk.enableSlots)[number])) {
          issues.push({
            code: "skill_enable_slot_mismatch",
            severity: "error",
            message: `NPC ${npc.id} skillEnable.${slot} 指向的 ${skillId} 不能激发该槽`,
          });
        }
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
    for (const allyId of npc.battleAllies ?? []) {
      if (!npcIds.has(allyId)) {
        issues.push({
          code: "broken_battle_ally",
          severity: "error",
          message: `NPC ${npc.id} battleAllies 引用不存在 NPC ${allyId}`,
        });
      } else if (allyId === npc.id) {
        issues.push({
          code: "self_battle_ally",
          severity: "error",
          message: `NPC ${npc.id} battleAllies 不可引用自身`,
        });
      }
    }
  }

  // 招式（DC-041）
  for (const move of pack.moves ?? []) {
    if (!skillIds.has(move.skillId)) {
      issues.push({
        code: "broken_move_skill",
        severity: "error",
        message: `招式 ${move.id} 引用不存在技能 ${move.skillId}`,
      });
    } else {
      const sk = pack.skills.find((s) => s.id === move.skillId);
      if (sk?.kind !== "special") {
        issues.push({
          code: "move_not_special",
          severity: "error",
          message: `招式 ${move.id} 须挂在特殊功上（当前 ${move.skillId}）`,
        });
      }
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
    for (const req of perform.learnRequires ?? []) {
      if (!skillIds.has(req.skillId)) {
        issues.push({
          code: "broken_perform_learn_req",
          severity: "error",
          message: `绝招 ${perform.id} learnRequires 引用不存在技能 ${req.skillId}`,
        });
      }
    }
    // DC-048：buff（护体）已由战斗引擎接线，不再 warning。
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

  // 生计回路（DC-045）
  const aggressiveRooms = new Set<string>();
  for (const room of pack.rooms) {
    for (const npcId of room.npcIds) {
      const npc = pack.npcs.find((n) => n.id === npcId);
      if (npc?.aggressive) aggressiveRooms.add(room.id);
    }
  }
  const exitAdj = (a: string, b: string): boolean => {
    const room = roomsById.get(a);
    return room?.exits.some((e) => e.roomId === b) ?? false;
  };
  for (const job of pack.grindJobs ?? []) {
    const hasOnlineRoute = Boolean(job.hubRoomId) || job.route.length > 0;
    if (!hasOnlineRoute) continue;
    if (!job.hubRoomId || job.route.length < 2) {
      issues.push({
        code: "grind_route_incomplete",
        severity: "error",
        message: `生计 ${job.id} 配置了在线路口须同时提供 hubRoomId 与至少 2 步 route`,
      });
      continue;
    }
    if (!job.roundGain) {
      issues.push({
        code: "grind_round_gain_missing",
        severity: "error",
        message: `生计 ${job.id} 在线路口须配置 roundGain`,
      });
    }
    if (!roomIds.has(job.hubRoomId)) {
      issues.push({
        code: "grind_unknown_hub",
        severity: "error",
        message: `生计 ${job.id} hubRoomId 不存在：${job.hubRoomId}`,
      });
    }
    if (job.route[0] !== job.hubRoomId || job.route[job.route.length - 1] !== job.hubRoomId) {
      issues.push({
        code: "grind_route_hub_ends",
        severity: "error",
        message: `生计 ${job.id} route 首末须为 hubRoomId`,
      });
    }
    for (let i = 0; i < job.route.length; i++) {
      const roomId = job.route[i]!;
      if (!roomIds.has(roomId)) {
        issues.push({
          code: "grind_unknown_route_room",
          severity: "error",
          message: `生计 ${job.id} route 含未知房间 ${roomId}`,
        });
        continue;
      }
      if (i > 0) {
        const prev = job.route[i - 1]!;
        if (!exitAdj(prev, roomId)) {
          issues.push({
            code: "grind_route_not_adjacent",
            severity: "error",
            message: `生计 ${job.id} route 不相邻：${prev} → ${roomId}`,
          });
        }
      }
    }
    for (const workId of job.workRooms) {
      if (!roomIds.has(workId)) {
        issues.push({
          code: "grind_unknown_work_room",
          severity: "error",
          message: `生计 ${job.id} workRooms 含未知房间 ${workId}`,
        });
      } else if (!job.route.includes(workId)) {
        issues.push({
          code: "grind_work_not_on_route",
          severity: "error",
          message: `生计 ${job.id} 工作点 ${workId} 不在 route 上`,
        });
      }
    }
    for (const wid of job.navWhitelist) {
      if (!roomIds.has(wid)) {
        issues.push({
          code: "grind_unknown_whitelist",
          severity: "error",
          message: `生计 ${job.id} navWhitelist 含未知房间 ${wid}`,
        });
      } else if (aggressiveRooms.has(wid)) {
        issues.push({
          code: "grind_whitelist_aggressive",
          severity: "error",
          message: `生计 ${job.id} 白名单含主动怪房间 ${wid}`,
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
