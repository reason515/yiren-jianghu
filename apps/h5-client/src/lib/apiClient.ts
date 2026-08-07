import { ApiError } from "./authApi.js";
import type { CombatIntent, CombatStatusResponse } from "./combatTypes.js";
import type { CharacterProfile, InvItemView, SkillRowView } from "./characterTypes.js";
import type { QuestOverviewResponse } from "./questTypes.js";
import type { AfkJobData, AfkReportData, AfkStartConfig, AfkStatusResponse } from "./afkTypes.js";
import type { SceneActionInput, SceneActionResult } from "./sceneTypes.js";
import type { PvpMatchDetail } from "./pvpTypes.js";
import type { ForumComment, ForumPost, ForumSection } from "./forumTypes.js";

/**
 * H5 API 客户端：统一 fetch + 错误信封解析（服务端权威，客户端只发意图）。
 * baseUrl：生产由 VITE_API_BASE 注入（/api，nginx 去前缀代理）；本地 dev 由 vite proxy 转发。
 */

export interface ApiClient {
  baseUrl: string;
  login(inviteCode: string): Promise<{ accountId: string; token: string }>;
  logout(): Promise<void>;
  resume(): Promise<{
    stateVersion: number;
    character: unknown;
    pendingAfkReports: Array<{ jobId: string; kind: string; status: string; stopReason?: string }>;
    pendingPvpReportIds: string[];
  }>;
  createCharacter(input: {
    name: string;
    gender: "male" | "female";
    attrs: { str: number; int: number; con: number; dex: number };
  }): Promise<{ characterId: string }>;
  getScene(): Promise<unknown>;
  move(dir: string): Promise<unknown>;
  sceneAction(input: SceneActionInput): Promise<SceneActionResult>;
  getCharacter(): Promise<CharacterProfile>;
  getInventory(): Promise<InvItemView[]>;
  getSkills(): Promise<SkillRowView[]>;
  equipInventory(itemId: string): Promise<{ ok: true }>;
  unequipInventory(itemId: string): Promise<{ ok: true }>;
  useInventory(itemId: string): Promise<{ ok: true; effect: string }>;
  learnSkill(skillId: string): Promise<unknown>;
  practiceSkill(skillId: string, count?: number): Promise<unknown>;
  studySkill(skillId: string, count?: number): Promise<unknown>;
  getQuests(): Promise<QuestOverviewResponse>;
  acceptQuest(questId: string): Promise<unknown>;
  reportQuest(questId: string): Promise<unknown>;
  startCombat(targetId: string): Promise<CombatStatusResponse>;
  combatAction(intent: CombatIntent): Promise<CombatStatusResponse>;
  getCombatStatus(): Promise<CombatStatusResponse | { active: false }>;
  getAfkStatus(): Promise<AfkStatusResponse>;
  startAfk(config: AfkStartConfig): Promise<AfkJobData>;
  stopAfk(): Promise<AfkReportData>;
  getAfkReports(): Promise<AfkReportData[]>;
  getTemplates(): Promise<Array<{ id: string; name: string }>>;
  getForumSections(): Promise<ForumSection[]>;
  getForumPosts(sectionId?: string): Promise<ForumPost[]>;
  getForumPost(postId: string): Promise<{ post: ForumPost; comments: ForumComment[] } | null>;
  createForumPost(input: { sectionId: string; title: string; body: string }): Promise<ForumPost>;
  addForumComment(postId: string, body: string): Promise<ForumComment>;
  toggleForumLike(postId: string): Promise<{ liked: boolean; likeCount: number }>;
  reportForumPost(input: {
    targetType: "post" | "comment";
    targetId: string;
    reason: string;
  }): Promise<{ ok: true }>;
  getLeaderboard(kind: "growth" | "season_pvp"): Promise<unknown>;
  getPvpSeason(): Promise<unknown>;
  getPvpOpponents(): Promise<unknown[]>;
  startPvpMatch(defenderId: string): Promise<unknown>;
  getPvpMatch(matchId: string): Promise<PvpMatchDetail>;
}

export function createApiClient(baseUrl: string, tokenStore: { get(): string | null }): ApiClient {
  const req = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const token = tokenStore.get();
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
    const data = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string; requestId?: string };
    } | null;
    if (!res.ok) {
      const e = data?.error;
      throw new ApiError(
        e?.code ?? "http_error",
        res.status,
        e?.message ?? `请求失败（${res.status}）`,
        e?.requestId,
      );
    }
    return data as T;
  };

  const get = <T>(path: string) => req<T>(path);
  const post = <T>(path: string, body: unknown) =>
    req<T>(path, { method: "POST", body: JSON.stringify(body) });

  return {
    baseUrl,
    login: (inviteCode) => post("/auth/login", { inviteCode }),
    logout: () => post("/auth/logout", {}),
    resume: () => get("/session/resume"),
    createCharacter: (input) => post("/characters", input),
    getScene: () => get("/scene"),
    move: (dir) => post("/scene/action", { type: "move", dir }),
    sceneAction: (input) => post("/scene/action", input),
    getCharacter: () => get("/characters/me"),
    getInventory: () => get("/inventory"),
    getSkills: () => get("/skills"),
    equipInventory: (itemId) => post("/inventory/equip", { itemId }),
    unequipInventory: (itemId) => post("/inventory/unequip", { itemId }),
    useInventory: (itemId) => post("/inventory/use", { itemId }),
    learnSkill: (skillId) => post("/skills/learn", { skillId }),
    practiceSkill: (skillId, count = 1) => post("/skills/practice", { skillId, count }),
    studySkill: (skillId, count = 1) => post("/skills/study", { skillId, count }),
    getQuests: () => get("/quests"),
    acceptQuest: (questId) => post("/quests/accept", { questId }),
    reportQuest: (questId) => post("/quests/report", { questId }),
    startCombat: (targetId) => post("/combat/start", { targetId }),
    combatAction: (intent) => post("/combat/action", intent),
    getCombatStatus: () => get("/combat/status"),
    getAfkStatus: () => get("/afk/status"),
    startAfk: (config) => post("/afk/start", config),
    stopAfk: () => post("/afk/stop", {}),
    getAfkReports: () => get("/afk/reports"),
    getTemplates: () => get("/templates"),
    getForumSections: () => get("/forum/sections"),
    getForumPosts: (sectionId) =>
      get(sectionId ? `/forum/posts?sectionId=${sectionId}` : "/forum/posts"),
    getForumPost: (postId) => get(`/forum/posts/${postId}`),
    createForumPost: (input) => post("/forum/posts", input),
    addForumComment: (postId, body) => post(`/forum/posts/${postId}/comments`, { body }),
    toggleForumLike: (postId) => post("/forum/likes", { postId }),
    reportForumPost: (input) => post("/forum/reports", input),
    getLeaderboard: (kind) => get(`/leaderboard/${kind}`),
    getPvpSeason: () => get("/pvp/season"),
    getPvpOpponents: () => get("/pvp/opponents"),
    startPvpMatch: (defenderId) => post("/pvp/match", { defenderId }),
    getPvpMatch: (matchId) => get(`/pvp/matches/${matchId}`),
  };
}
