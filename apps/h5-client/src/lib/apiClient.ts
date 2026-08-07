import { ApiError } from "./authApi.js";

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
    pendingAfkReports: unknown[];
    pendingPvpReportIds: string[];
  }>;
  createCharacter(input: {
    name: string;
    gender: "male" | "female";
    attrs: { str: number; int: number; con: number; dex: number };
  }): Promise<{ characterId: string }>;
  getScene(): Promise<unknown>;
  move(dir: string): Promise<unknown>;
  getInventory(): Promise<unknown[]>;
  getSkills(): Promise<unknown[]>;
  getQuests(): Promise<unknown[]>;
  acceptQuest(questId: string): Promise<unknown>;
  reportQuest(questId: string): Promise<unknown>;
  getAfkStatus(): Promise<unknown>;
  startAfk(config: unknown): Promise<unknown>;
  stopAfk(): Promise<unknown>;
  getAfkReports(): Promise<unknown[]>;
  getForumSections(): Promise<unknown[]>;
  getForumPosts(sectionId?: string): Promise<unknown[]>;
  getForumPost(postId: string): Promise<unknown>;
  createForumPost(input: { sectionId: string; title: string; body: string }): Promise<unknown>;
  addForumComment(postId: string, body: string): Promise<unknown>;
  toggleForumLike(postId: string): Promise<unknown>;
  getLeaderboard(kind: "growth" | "season_pvp"): Promise<unknown>;
  getPvpSeason(): Promise<unknown>;
  getPvpOpponents(): Promise<unknown[]>;
  startPvpMatch(defenderId: string): Promise<unknown>;
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
    getInventory: () => get("/inventory"),
    getSkills: () => get("/skills"),
    getQuests: () => get("/quests"),
    acceptQuest: (questId) => post("/quests/accept", { questId }),
    reportQuest: (questId) => post("/quests/report", { questId }),
    getAfkStatus: () => get("/afk/status"),
    startAfk: (config) => post("/afk/start", config),
    stopAfk: () => post("/afk/stop", {}),
    getAfkReports: () => get("/afk/reports"),
    getForumSections: () => get("/forum/sections"),
    getForumPosts: (sectionId) =>
      get(sectionId ? `/forum/posts?sectionId=${sectionId}` : "/forum/posts"),
    getForumPost: (postId) => get(`/forum/posts/${postId}`),
    createForumPost: (input) => post("/forum/posts", input),
    addForumComment: (postId, body) => post(`/forum/posts/${postId}/comments`, { body }),
    toggleForumLike: (postId) => post("/forum/likes", { postId }),
    getLeaderboard: (kind) => get(`/leaderboard/${kind}`),
    getPvpSeason: () => get("/pvp/season"),
    getPvpOpponents: () => get("/pvp/opponents"),
    startPvpMatch: (defenderId) => post("/pvp/match", { defenderId }),
  };
}
