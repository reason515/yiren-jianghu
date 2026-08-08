import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import { ApiError, createAuthApi, type AuthApi, type AuthSession } from "./lib/authApi.js";
import { createApiClient, type ApiClient } from "./lib/apiClient.js";
import {
  toCombatState,
  type CombatIntent,
  type CombatState,
  type CombatStatusResponse,
} from "./lib/combatTypes.js";
import { LoginPage } from "./components/LoginPage.js";
import { CharacterCreateSheet } from "./components/CharacterCreateSheet.js";
import { SceneView } from "./components/SceneView.js";
import { EntitySheet } from "./components/EntitySheet.js";
import { ShopView } from "./components/ShopView.js";
import { CombatView } from "./components/CombatView.js";
import { CharacterSheet } from "./components/CharacterSheet.js";
import { ConfirmSheet } from "./components/ConfirmSheet.js";
import { Sheet } from "./components/base/Sheet.js";
import { QuestPanel } from "./components/QuestPanel.js";
import { GrindBanner } from "./components/GrindBanner.js";
import { AfkSheet } from "./components/AfkSheet.js";
import { AfkReportView } from "./components/AfkReportView.js";
import { PvpView } from "./components/PvpView.js";
import { PvpReplayView } from "./components/PvpReplayView.js";
import { ForumSheet } from "./components/ForumView.js";
import { PostComposer } from "./components/PostComposer.js";
import { MapSheet } from "./components/MapSheet.js";
import { LeaderboardView } from "./components/LeaderboardView.js";
import { ReconnectingOverlay } from "./components/ReconnectingOverlay.js";
import { GuideTip } from "./components/GuideTip.js";
import { toQuestPanelData, type QuestPanelData, type QuestRewardView } from "./lib/questTypes.js";
import { toCharacterView, type CharacterView } from "./lib/characterTypes.js";
import {
  toAfkQuestOptions,
  toAfkSkillOptions,
  toAfkStatusView,
  type AfkQuestOption,
  type AfkReportData,
  type AfkSkillOption,
  type AfkStartConfig,
  type AfkStatusView,
  type AfkTemplateOption,
} from "./lib/afkTypes.js";
import type { PvpMatchDetail, PvpMatchResult, PvpOpponent, PvpSeason } from "./lib/pvpTypes.js";
import type { ForumPost, ForumViewData, ForumViewState } from "./lib/forumTypes.js";
import type { LeaderboardData } from "./lib/leaderboardTypes.js";
import type { MapData } from "./lib/mapTypes.js";
import {
  initialReconnectState,
  onConnectSuccess,
  onDisconnect,
  onRetryFailed,
  type ReconnectState,
} from "./lib/reconnect.js";
import {
  advanceGuide,
  guideText,
  isOnboarded,
  shouldShowGuide,
  type GuideEvent,
} from "./lib/onboarding.js";
import type {
  SceneItem,
  SceneNpc,
  SceneRoom,
  SceneTalkResult,
  SceneTradeResult,
} from "./lib/sceneTypes.js";

/**
 * H5 应用组装（M3 客户端闭环）：
 * 未登录 → LoginPage；有 token 无角色 → CharacterCreateSheet；有角色 → 场景主界面 + 面板导航。
 * 服务端权威：客户端只发意图、渲染事件；断线重连走 ReconnectingOverlay + resume。
 */

const BASE_URL = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api";
const TOKEN_KEY = "yjh.token";
const ONBOARD_KEY = "yjh.onboard";

type Panel = "none" | "character" | "afk" | "quests" | "forum" | "leaderboard" | "map" | "pvp";

function loadToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function isActiveCombat(
  value: CombatStatusResponse | { active: false },
): value is CombatStatusResponse {
  return "status" in value && value.status === "ongoing";
}

export function App(): JSX.Element {
  const [token, setToken] = useState<string | null>(loadToken());
  const [booting, setBooting] = useState<boolean>(true);
  const [character, setCharacter] = useState<{ id: string; name: string } | null>(null);
  const [needCreate, setNeedCreate] = useState(false);
  const [room, setRoom] = useState<SceneRoom | null>(null);
  const [panel, setPanel] = useState<Panel>("none");
  const [moreOpen, setMoreOpen] = useState(false);
  const [characterView, setCharacterView] = useState<CharacterView | null>(null);
  const [characterPending, setCharacterPending] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<SceneNpc | SceneItem | null>(null);
  const [dialogue, setDialogue] = useState<SceneTalkResult | null>(null);
  const [trade, setTrade] = useState<SceneTradeResult | null>(null);
  const [combat, setCombat] = useState<CombatState | null>(null);
  const [combatOpen, setCombatOpen] = useState(false);
  const [questData, setQuestData] = useState<QuestPanelData | null>(null);
  const [questOpen, setQuestOpen] = useState(false);
  const [afkStatus, setAfkStatus] = useState<AfkStatusView>({ active: false, message: "" });
  const [afkSkills, setAfkSkills] = useState<AfkSkillOption[]>([]);
  const [afkQuests, setAfkQuests] = useState<AfkQuestOption[]>([]);
  const [afkTemplates, setAfkTemplates] = useState<AfkTemplateOption[]>([]);
  const [afkPending, setAfkPending] = useState(false);
  const [afkReport, setAfkReport] = useState<AfkReportData | null>(null);
  const [afkReportOpen, setAfkReportOpen] = useState(false);
  const [pvpSeason, setPvpSeason] = useState<PvpSeason | null>(null);
  const [pvpOpponents, setPvpOpponents] = useState<PvpOpponent[]>([]);
  const [pvpPending, setPvpPending] = useState(false);
  const [pvpChallenge, setPvpChallenge] = useState<PvpOpponent | null>(null);
  const [pvpReplay, setPvpReplay] = useState<PvpMatchDetail | null>(null);
  const [pvpReplayOpen, setPvpReplayOpen] = useState(false);
  const [forumData, setForumData] = useState<ForumViewData>({
    sections: [],
    posts: [],
    comments: [],
  });
  const [forumView, setForumView] = useState<ForumViewState>("sections");
  const [forumActivePost, setForumActivePost] = useState<ForumPost | null>(null);
  const [forumSectionId, setForumSectionId] = useState<string | null>(null);
  const [forumComposer, setForumComposer] = useState<
    | { kind: "post"; sectionId: string }
    | { kind: "comment"; postId: string }
    | { kind: "report"; targetType: "post" | "comment"; targetId: string }
    | null
  >(null);
  const [forumPending, setForumPending] = useState(false);
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [lbGrowth, setLbGrowth] = useState<LeaderboardData | null>(null);
  const [lbSeason, setLbSeason] = useState<LeaderboardData | null>(null);
  const [reconnect, setReconnect] = useState<ReconnectState>(initialReconnectState());
  const reconnectRef = useRef<ReconnectState>(reconnect);
  reconnectRef.current = reconnect;
  const retryTimer = useRef<number | null>(null);
  const [guideStep, setGuideStep] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(ONBOARD_KEY) ?? 0) || 0;
    } catch {
      return 0;
    }
  });
  const [guideTipText, setGuideTipText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const api: ApiClient = useMemo(() => createApiClient(BASE_URL, { get: () => token }), [token]);
  const authApi: AuthApi = useMemo(() => createAuthApi(BASE_URL), []);

  const refreshScene = useCallback(async (): Promise<void> => {
    try {
      setRoom((await api.getScene()) as SceneRoom);
    } catch (e) {
      notify(e);
    }
  }, [api]);

  const refreshCombat = useCallback(async (): Promise<void> => {
    try {
      const current = await api.getCombatStatus();
      if (isActiveCombat(current)) {
        setCombat(toCombatState(current));
        setCombatOpen(true);
      } else {
        setCombat(null);
      }
    } catch (e) {
      notify(e);
    }
  }, [api]);

  const refreshQuests = useCallback(async (): Promise<void> => {
    try {
      setQuestData(toQuestPanelData(await api.getQuests()));
    } catch (e) {
      notify(e);
    }
  }, [api]);

  const refreshCharacter = useCallback(async (): Promise<void> => {
    try {
      const [profile, skills, inventory] = await Promise.all([
        api.getCharacter(),
        api.getSkills(),
        api.getInventory(),
      ]);
      setCharacterView(toCharacterView(profile, skills, inventory));
    } catch (e) {
      notify(e);
    }
  }, [api]);

  const refreshAfk = useCallback(
    async (pendingReportIds: string[] = []): Promise<void> => {
      try {
        const [status, reports, skills, templates, quests] = await Promise.all([
          api.getAfkStatus(),
          api.getAfkReports(),
          api.getSkills(),
          api.getTemplates(),
          api.getQuests(),
        ]);
        setAfkStatus(toAfkStatusView(status));
        setAfkSkills(toAfkSkillOptions(skills));
        setAfkTemplates(templates.map((template) => ({ id: template.id, name: template.name })));
        setAfkQuests(toAfkQuestOptions(toQuestPanelData(quests).quests));
        const unread = reports.find((report) => pendingReportIds.includes(report.jobId));
        if (unread) {
          setAfkReport(unread);
          setAfkReportOpen(true);
        }
      } catch (e) {
        notify(e);
      }
    },
    [api],
  );

  // 恢复点：resume + 刷新全量状态；成功 true，失败抛错（网络 TypeError 或 ApiError 由调用方裁决）。
  const restoreSession = useCallback(async (): Promise<boolean> => {
    const res = await api.resume();
    if (res.character) {
      setCharacter({
        id: (res.character as { id: string }).id,
        name: (res.character as { name: string }).name,
      });
      setNeedCreate(false);
      await Promise.all([
        refreshScene(),
        refreshCombat(),
        refreshQuests(),
        refreshAfk(res.pendingAfkReports.map((report) => report.jobId)),
      ]);
      // 断线期间完成的论剑，重连后直接翻开战报回响。
      const firstPvp = res.pendingPvpReportIds[0];
      if (firstPvp) {
        const detail = await api.getPvpMatch(firstPvp);
        if (detail) {
          setPvpReplay(detail);
          setPvpReplayOpen(true);
        }
      }
    } else {
      setNeedCreate(true);
    }
    return true;
  }, [api, refreshAfk, refreshCombat, refreshQuests, refreshScene]);

  const clearRetryTimer = (): void => {
    if (retryTimer.current) window.clearTimeout(retryTimer.current);
    retryTimer.current = null;
  };

  const retryNow = useCallback(async (): Promise<void> => {
    const state = reconnectRef.current;
    if (state.phase !== "reconnecting") return;
    try {
      await restoreSession();
      clearRetryTimer();
      setReconnect(onConnectSuccess(state));
    } catch (e) {
      if (e instanceof ApiError && e.code === "unauthorized") {
        clearRetryTimer();
        setToken(null);
        localStorage.removeItem(TOKEN_KEY);
        return;
      }
      const next = onRetryFailed(state);
      setReconnect(next);
      if (next.phase === "failed") {
        clearRetryTimer();
        setError("久唤不应，江湖暂别。稍后再来。");
      } else {
        retryTimer.current = window.setTimeout(() => void retryNow(), next.nextRetryMs);
      }
    }
  }, [restoreSession]);

  const beginReconnect = useCallback((): void => {
    const state = reconnectRef.current;
    if (state.phase === "reconnecting" || state.phase === "failed") return;
    const next = onDisconnect(state);
    setReconnect(next);
    retryTimer.current = window.setTimeout(() => void retryNow(), next.nextRetryMs);
  }, [retryNow]);

  // 网络层失败（fetch 抛错、非业务信封）统一进入重连；业务错误仅 toast。
  const notify = (e: unknown): void => {
    if (!(e instanceof ApiError)) {
      beginReconnect();
      return;
    }
    setError(e.message);
  };

  // 首启引导：事件驱动轻提示（欢迎/接任务/学武/首战），乱序跳级、完成后不再打扰。
  const triggerGuide = useCallback(
    (event: GuideEvent): void => {
      if (isOnboarded(guideStep)) return;
      if (!shouldShowGuide(guideStep, event)) return;
      const next = advanceGuide(guideStep, event);
      const text = guideText(next);
      if (!text) return;
      setGuideStep(next);
      setGuideTipText(text);
      try {
        localStorage.setItem(ONBOARD_KEY, String(next));
      } catch {
        // 隐私模式等场景忽略
      }
    },
    [guideStep],
  );

  // 首次进入场景 → 欢迎引导。
  useEffect(() => {
    if (room && character && !isOnboarded(guideStep)) triggerGuide("enter_scene");
  }, [room, character, guideStep, triggerGuide]);

  // 启动：token 有效则恢复（resume），并优先恢复未结束的战局；网络断则进重连，401 则回登录。
  useEffect(() => {
    if (!token) {
      setBooting(false);
      return;
    }
    void (async () => {
      try {
        await restoreSession();
      } catch (e) {
        if (e instanceof ApiError && e.code === "unauthorized") {
          setToken(null);
          localStorage.removeItem(TOKEN_KEY);
        } else {
          beginReconnect();
        }
      } finally {
        setBooting(false);
      }
    })();
    return clearRetryTimer;
  }, [token, api, beginReconnect, restoreSession]);

  const onLoggedIn = (session: AuthSession): void => {
    localStorage.setItem(TOKEN_KEY, session.token);
    setToken(session.token);
  };

  const onCreated = (): void => {
    setNeedCreate(false);
    void (async () => {
      const res = await api.resume();
      if (res.character) {
        setCharacter({
          id: (res.character as { id: string }).id,
          name: (res.character as { name: string }).name,
        });
      }
      await Promise.all([refreshScene(), refreshQuests(), refreshAfk()]);
    })().catch(notify);
  };

  const onGo = async (dir: string): Promise<void> => {
    try {
      setRoom((await api.move(dir)) as SceneRoom);
      await refreshQuests();
    } catch (e) {
      notify(e);
    }
  };

  const openQuests = (): void => {
    void (async () => {
      await refreshQuests();
      setQuestOpen(true);
    })();
  };

  const openCharacter = (): void => {
    setPanel("character");
    void refreshCharacter();
  };

  const openAfk = (): void => {
    setPanel("afk");
    void refreshAfk();
  };

  const refreshPvp = useCallback(async (): Promise<void> => {
    try {
      const [season, opponents] = await Promise.all([api.getPvpSeason(), api.getPvpOpponents()]);
      setPvpSeason(season as PvpSeason);
      setPvpOpponents(opponents as PvpOpponent[]);
    } catch (e) {
      notify(e);
    }
  }, [api]);

  const openPvp = (): void => {
    setPanel("pvp");
    void refreshPvp();
  };

  const onChallenge = (opponent: PvpOpponent): void => {
    setPvpChallenge(opponent);
  };

  const onConfirmMatch = (): void => {
    if (!pvpChallenge) return;
    setPvpPending(true);
    void api
      .startPvpMatch(pvpChallenge.characterId)
      .then(async (result) => {
        const match = result as PvpMatchResult;
        setPvpChallenge(null);
        setPvpReplay(await api.getPvpMatch(match.id));
        setPvpReplayOpen(true);
        setError(
          match.result === "challenger_win"
            ? "剑下见真章——这一场你赢了。"
            : match.result === "defender_win"
              ? "技不如人，来日再战。"
              : "两下未分胜负，各自收剑。",
        );
      })
      .catch(notify)
      .finally(() => setPvpPending(false));
  };

  const refreshForumSections = useCallback(async (): Promise<void> => {
    try {
      const sections = await api.getForumSections();
      setForumData((prev) => ({ ...prev, sections }));
      setForumView("sections");
    } catch (e) {
      notify(e);
    }
  }, [api]);

  const openForum = (): void => {
    setPanel("forum");
    void refreshForumSections();
  };

  const onForumOpenSection = (sectionId: string): void => {
    setForumSectionId(sectionId);
    void api
      .getForumPosts(sectionId)
      .then((posts) => {
        setForumData((prev) => ({ ...prev, posts }));
        setForumView("posts");
      })
      .catch(notify);
  };

  const onForumOpenPost = (postId: string): void => {
    void api
      .getForumPost(postId)
      .then((detail) => {
        if (!detail) {
          setError("这帖子已随风而去。");
          return;
        }
        setForumActivePost(detail.post);
        setForumData((prev) => ({ ...prev, comments: detail.comments }));
        setForumView("post");
      })
      .catch(notify);
  };

  const onForumBack = (): void => {
    if (forumView === "post") {
      setForumView("posts");
    } else if (forumView === "posts") {
      void refreshForumSections();
    }
  };

  const onForumLike = (postId: string): void => {
    if (forumPending) return;
    setForumPending(true);
    void api
      .toggleForumLike(postId)
      .then(({ liked, likeCount }) => {
        setForumActivePost((prev) =>
          prev && prev.id === postId ? { ...prev, likedByMe: liked, likeCount } : prev,
        );
        setForumData((prev) => ({
          ...prev,
          posts: prev.posts.map((post) =>
            post.id === postId ? { ...post, likedByMe: liked, likeCount } : post,
          ),
        }));
        setError(liked ? "已记下这一赞。" : "收回了这一赞。");
      })
      .catch(notify)
      .finally(() => setForumPending(false));
  };

  const onForumReportPost = (postId: string): void => {
    setForumComposer({ kind: "report", targetType: "post", targetId: postId });
  };

  const onForumReportComment = (commentId: string): void => {
    setForumComposer({ kind: "report", targetType: "comment", targetId: commentId });
  };

  const onForumComposePost = (): void => {
    if (!forumSectionId) return;
    setForumComposer({ kind: "post", sectionId: forumSectionId });
  };

  const onForumComposeComment = (): void => {
    if (!forumActivePost) return;
    setForumComposer({ kind: "comment", postId: forumActivePost.id });
  };

  const onForumComposerSubmit = (input: { title?: string; body: string }): void => {
    if (!forumComposer || forumPending) return;
    setForumPending(true);
    const task = (() => {
      switch (forumComposer.kind) {
        case "post":
          return api.createForumPost({
            sectionId: forumComposer.sectionId,
            title: input.title ?? "",
            body: input.body,
          });
        case "comment":
          return api.addForumComment(forumComposer.postId, input.body);
        case "report":
          return api.reportForumPost({
            targetType: forumComposer.targetType,
            targetId: forumComposer.targetId,
            reason: input.body,
          });
      }
    })();
    void task
      .then(async () => {
        setForumComposer(null);
        if (forumComposer.kind === "post") {
          setError("已贴上江湖茶话。");
          await refreshForumSections();
        } else if (forumComposer.kind === "comment") {
          setError("已回帖。");
          await onForumOpenPost(forumComposer.postId);
        } else {
          setError("已递呈坊主处置。");
        }
      })
      .catch(notify)
      .finally(() => setForumPending(false));
  };

  const refreshMap = useCallback(async (): Promise<void> => {
    try {
      setMapData(await api.getMap());
    } catch (e) {
      notify(e);
    }
  }, [api]);

  const openMap = (): void => {
    setPanel("map");
    void refreshMap();
  };

  const onMapNavigate = (roomId: string): void => {
    const exit = room?.exits.find((candidate) => candidate.roomId === roomId);
    if (!exit) {
      setError("路途尚远，先循眼前的出口前行。");
      return;
    }
    setPanel("none");
    void onGo(exit.dir);
  };

  const refreshLeaderboard = useCallback(async (): Promise<void> => {
    try {
      const [growth, season] = await Promise.all([
        api.getLeaderboard("growth"),
        api.getLeaderboard("season_pvp"),
      ]);
      // 榜单为公开读（isMe 恒 false），客户端按自己的角色 id 标记“我的行”。
      const markMe = (data: LeaderboardData): LeaderboardData => ({
        ...data,
        entries: data.entries.map((entry) => ({
          ...entry,
          isMe: entry.characterId === character?.id,
        })),
      });
      setLbGrowth(markMe(growth as LeaderboardData));
      setLbSeason(markMe(season as LeaderboardData));
    } catch (e) {
      notify(e);
    }
  }, [api, character]);

  const openLeaderboard = (): void => {
    setPanel("leaderboard");
    void refreshLeaderboard();
  };

  const onAfkStart = (config: AfkStartConfig): void => {
    setAfkPending(true);
    void api
      .startAfk(config)
      .then((job) => {
        setAfkStatus(toAfkStatusView(job));
        setPanel("none");
        setError("气息渐定，行止已安排妥当。");
      })
      .catch(notify)
      .finally(() => setAfkPending(false));
  };

  const onAfkStop = (): void => {
    setAfkPending(true);
    void api
      .stopAfk()
      .then((report) => {
        setAfkStatus({ active: false, message: "", reason: report.reason ?? "行止已收" });
        setAfkReport(report);
        setAfkReportOpen(true);
        setPanel("none");
      })
      .catch(notify)
      .finally(() => setAfkPending(false));
  };

  const onSkillAction = (action: "learn" | "practice" | "study", skillId: string): void => {
    const key = `skill:${action}:${skillId}`;
    const name = characterView?.skills.find((skill) => skill.id === skillId)?.name ?? "这门武功";
    setCharacterPending(key);
    const request =
      action === "learn"
        ? api.learnSkill(skillId)
        : action === "practice"
          ? api.practiceSkill(skillId)
          : api.studySkill(skillId);
    void request
      .then(async () => {
        await refreshCharacter();
        triggerGuide("skill_learned");
        setError(
          `${name}${action === "learn" ? "已请教" : action === "practice" ? "已演练" : "已参悟"}。`,
        );
      })
      .catch(notify)
      .finally(() => setCharacterPending(null));
  };

  const onInventoryAction = (action: "equip" | "unequip" | "use", itemId: string): void => {
    const key = `item:${action}:${itemId}`;
    const name = characterView?.inventory.find((item) => item.id === itemId)?.name ?? "此物";
    setCharacterPending(key);
    const request =
      action === "equip"
        ? api.equipInventory(itemId)
        : action === "unequip"
          ? api.unequipInventory(itemId)
          : api.useInventory(itemId);
    void request
      .then(async () => {
        await refreshCharacter();
        setError(
          `${name}${action === "equip" ? "已佩上" : action === "unequip" ? "已卸下" : "已使用"}。`,
        );
      })
      .catch(notify)
      .finally(() => setCharacterPending(null));
  };

  const discardCharacter = (): void => {
    if (!token) return;
    setDiscarding(true);
    void authApi
      .discardCharacter(token)
      .then(() => {
        setDiscardOpen(false);
        setCharacterView(null);
        setCharacter(null);
        setRoom(null);
        setNeedCreate(true);
        setPanel("none");
      })
      .catch(notify)
      .finally(() => setDiscarding(false));
  };

  const onQuestGoTo = (roomId: string): void => {
    const exit = room?.exits.find((candidate) => candidate.roomId === roomId);
    setQuestOpen(false);
    if (!exit) {
      setError("路途尚远，先循眼前的出口前行。");
      return;
    }
    void onGo(exit.dir);
  };

  const onQuestAccept = (questId: string): void => {
    void api
      .acceptQuest(questId)
      .then(() => {
        triggerGuide("quest_accepted");
        return refreshQuests();
      })
      .catch(notify);
  };

  const onQuestReport = (questId: string): void => {
    void api
      .reportQuest(questId)
      .then((result) => {
        const rewards = (result as { rewards: QuestRewardView }).rewards;
        setError(
          `交差已毕：经验 ${rewards.exp} · 潜能 ${rewards.potential} · 银两 ${rewards.silver}`,
        );
        return refreshQuests();
      })
      .catch(notify);
  };

  const startCombat = async (targetId: string): Promise<void> => {
    try {
      setCombat(toCombatState(await api.startCombat(targetId)));
      setSelectedEntity(null);
      setCombatOpen(true);
    } catch (e) {
      notify(e);
    }
  };

  const onEntityAction = (command: string): void => {
    const [action, targetId] = command.split(" ");
    if (!action || !targetId) return;
    if (action === "fight") {
      void startCombat(targetId);
      return;
    }
    if (action === "quest") {
      setSelectedEntity(null);
      openQuests();
      return;
    }
    if (action === "talk" || action === "trade") {
      void api
        .sceneAction({ type: action, targetId })
        .then((result) => {
          setSelectedEntity(null);
          if (result.kind === "talk") setDialogue(result);
          if (result.kind === "trade") setTrade(result);
        })
        .catch(notify);
      return;
    }
    if (action === "take") {
      void api
        .sceneAction({ type: "take", targetId })
        .then((result) => {
          setSelectedEntity(null);
          setError(result.kind === "take" ? `拾得：${result.item.name}` : "此物已收入行囊。");
          return refreshScene();
        })
        .catch(notify);
    }
  };

  const onTrade = (type: "buy" | "sell", itemId: string): void => {
    if (!trade) return;
    void api
      .sceneAction({ type, targetId: trade.vendor.id, itemId, count: 1 })
      .then((result) => {
        if (result.kind === "trade") setTrade(result);
      })
      .catch(notify);
  };

  const onCombatAction = (intent: CombatIntent): void => {
    void (async () => {
      try {
        const next = await api.combatAction(intent);
        const state = toCombatState(next);
        setCombat(state);
        if (state.result) {
          if (state.result === "win") triggerGuide("battle_won");
          await Promise.all([refreshScene(), refreshQuests()]);
        }
      } catch (e) {
        // 服务端拒绝绝招时保留当前战局，反馈其权威文案。
        notify(e);
      }
    })();
  };

  const closeCombat = (): void => {
    if (combat?.inCombat) return;
    setCombat(null);
    setCombatOpen(false);
  };

  const onLogout = async (): Promise<void> => {
    try {
      await api.logout();
    } catch {
      // 即使登出接口失败也清本地会话
    }
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setCharacter(null);
    setCharacterView(null);
    setCharacterPending(null);
    setDiscardOpen(false);
    setRoom(null);
    setSelectedEntity(null);
    setDialogue(null);
    setTrade(null);
    setCombat(null);
    setCombatOpen(false);
    setQuestData(null);
    setQuestOpen(false);
    setAfkStatus({ active: false, message: "" });
    setAfkSkills([]);
    setAfkQuests([]);
    setAfkTemplates([]);
    setAfkPending(false);
    setAfkReport(null);
    setAfkReportOpen(false);
    setPvpSeason(null);
    setPvpOpponents([]);
    setPvpPending(false);
    setPvpChallenge(null);
    setPvpReplay(null);
    setPvpReplayOpen(false);
    setForumData({ sections: [], posts: [], comments: [] });
    setForumView("sections");
    setForumActivePost(null);
    setForumSectionId(null);
    setForumComposer(null);
    setForumPending(false);
    setMapData(null);
    setLbGrowth(null);
    setLbSeason(null);
    clearRetryTimer();
    setReconnect(initialReconnectState());
    setGuideTipText(null);
    setPanel("none");
  };

  if (booting) {
    return <div className="boot">风起于青萍之末……</div>;
  }

  if (!token) {
    return <LoginPage api={authApi} onLoggedIn={onLoggedIn} />;
  }

  return (
    <div className="app">
      <ReconnectingOverlay
        visible={reconnect.phase === "reconnecting"}
        attempt={reconnect.attempt}
        nextRetryMs={reconnect.nextRetryMs}
        onRetryNow={() => void retryNow()}
      />
      {guideTipText && <GuideTip text={guideTipText} onDismiss={() => setGuideTipText(null)} />}
      {needCreate && (
        <CharacterCreateSheet
          open
          token={token}
          api={authApi}
          onCreated={onCreated}
          onClose={() => undefined}
        />
      )}

      {room && !needCreate && (
        <>
          <SceneView
            room={room}
            quest={questData?.quests.find((q) => q.state === "accepted") ?? null}
            onOpenQuests={openQuests}
            onGo={(d) => void onGo(d)}
            onSelectNpc={setSelectedEntity}
            onSelectItem={(itemId) => {
              const item = room.items.find((candidate) => candidate.id === itemId);
              if (item) setSelectedEntity(item);
            }}
            onAction={() => openQuests()}
          />
          <GrindBanner
            active={afkStatus.active}
            message={afkStatus.message}
            reason={afkStatus.reason}
            onStop={afkStatus.active ? onAfkStop : undefined}
          />
          <nav className="app-nav" aria-label="主功能">
            {combat && (
              <button className="app-nav-btn" onClick={() => setCombatOpen(true)}>
                战局
              </button>
            )}
            <button className="app-nav-btn" onClick={openCharacter}>
              角色
            </button>
            <button className="app-nav-btn" onClick={openAfk}>
              挂机
            </button>
            <button className="app-nav-btn" onClick={openQuests}>
              任务
            </button>
            <button className="app-nav-btn" onClick={openPvp}>
              论剑
            </button>
            <button className="app-nav-btn" onClick={openForum}>
              论坛
            </button>
            <button className="app-nav-btn" onClick={() => setMoreOpen(true)}>
              更多
            </button>
          </nav>

          {moreOpen && (
            <Sheet open title="更多" onClose={() => setMoreOpen(false)}>
              <div className="more-list">
                <button
                  type="button"
                  className="more-item"
                  onClick={() => {
                    setMoreOpen(false);
                    openLeaderboard();
                  }}
                >
                  榜单
                </button>
                <button
                  type="button"
                  className="more-item"
                  onClick={() => {
                    setMoreOpen(false);
                    openMap();
                  }}
                >
                  地图
                </button>
                <button
                  type="button"
                  className="more-item danger"
                  onClick={() => {
                    setMoreOpen(false);
                    void onLogout();
                  }}
                >
                  离开
                </button>
              </div>
            </Sheet>
          )}
        </>
      )}

      {panel === "afk" && (
        <AfkSheet
          open
          skills={afkSkills}
          quests={afkQuests}
          templates={afkTemplates}
          active={afkStatus.active}
          statusMessage={afkStatus.message}
          pending={afkPending}
          onStart={onAfkStart}
          onStop={onAfkStop}
          onClose={() => setPanel("none")}
        />
      )}

      <AfkReportView
        open={afkReportOpen}
        report={afkReport}
        onClose={() => setAfkReportOpen(false)}
      />

      <PvpReplayView
        open={pvpReplayOpen}
        match={pvpReplay}
        onClose={() => setPvpReplayOpen(false)}
      />

      {panel === "pvp" && (
        <PvpView
          open
          season={pvpSeason}
          opponents={pvpOpponents}
          pending={pvpPending}
          onChallenge={onChallenge}
          onClose={() => setPanel("none")}
        />
      )}

      {panel === "forum" && (
        <ForumSheet
          open
          data={forumData}
          view={forumView}
          activePost={forumActivePost ?? undefined}
          onOpenSection={onForumOpenSection}
          onOpenPost={onForumOpenPost}
          onBack={onForumBack}
          onLike={onForumLike}
          onReportPost={onForumReportPost}
          onReportComment={onForumReportComment}
          onComposePost={onForumComposePost}
          onComposeComment={onForumComposeComment}
          onClose={() => setPanel("none")}
        />
      )}

      {forumComposer && (
        <PostComposer
          open
          title={
            forumComposer.kind === "post"
              ? "发新帖"
              : forumComposer.kind === "comment"
                ? "回帖"
                : "举报"
          }
          showTitleField={forumComposer.kind === "post"}
          maxBodyLength={
            forumComposer.kind === "post" ? 500 : forumComposer.kind === "comment" ? 200 : 100
          }
          submitLabel={
            forumComposer.kind === "post"
              ? "发布"
              : forumComposer.kind === "comment"
                ? "回帖"
                : "递呈"
          }
          onSubmit={onForumComposerSubmit}
          onClose={() => setForumComposer(null)}
        />
      )}

      {panel === "map" && mapData && (
        <MapSheet
          open
          rooms={mapData.rooms}
          edges={mapData.edges}
          onNavigate={onMapNavigate}
          onClose={() => setPanel("none")}
        />
      )}

      {panel === "leaderboard" && lbGrowth && lbSeason && (
        <LeaderboardView
          open
          growth={lbGrowth}
          season={lbSeason}
          onClose={() => setPanel("none")}
        />
      )}

      {pvpChallenge && (
        <ConfirmSheet
          open
          title="邀战"
          message={`向 ${pvpChallenge.name} 发起论剑？胜负皆论剑分，且按你备下的路数迎敌。`}
          confirmLabel="发起论剑"
          busy={pvpPending}
          onConfirm={onConfirmMatch}
          onCancel={() => setPvpChallenge(null)}
        />
      )}

      {panel === "character" && characterView && (
        <CharacterSheet
          open
          character={characterView}
          pendingAction={characterPending}
          onClose={() => setPanel("none")}
          onSkillAction={onSkillAction}
          onInventoryAction={onInventoryAction}
          onDiscard={() => setDiscardOpen(true)}
        />
      )}

      <ConfirmSheet
        open={discardOpen}
        title="放弃此身"
        message="此身一旦放下，旧日行囊与所学皆不再随行。"
        confirmLabel="放弃角色"
        busy={discarding}
        onConfirm={discardCharacter}
        onCancel={() => setDiscardOpen(false)}
      />

      {selectedEntity && (
        <EntitySheet
          open
          entity={selectedEntity}
          onAction={onEntityAction}
          onClose={() => setSelectedEntity(null)}
        />
      )}

      {dialogue && (
        <Sheet open title={dialogue.npc.name} onClose={() => setDialogue(null)}>
          <div className="scene-dialogue">
            {dialogue.dialogue.map((line, index) => (
              <p key={`${dialogue.npc.id}-${index}`}>{line}</p>
            ))}
          </div>
        </Sheet>
      )}

      {trade && (
        <Sheet open title={trade.vendor.name} onClose={() => setTrade(null)}>
          <ShopView
            data={trade}
            onBuy={(itemId) => onTrade("buy", itemId)}
            onSell={(itemId) => onTrade("sell", itemId)}
          />
        </Sheet>
      )}

      {combat && combatOpen && (
        <Sheet open title="战局" onClose={closeCombat}>
          <CombatView state={combat} onAction={onCombatAction} />
        </Sheet>
      )}

      {questData && questOpen && (
        <Sheet open title="手头之事" onClose={() => setQuestOpen(false)}>
          <QuestPanel
            data={questData}
            onGoTo={onQuestGoTo}
            onAccept={onQuestAccept}
            onReport={onQuestReport}
          />
        </Sheet>
      )}

      {error && (
        <div className="toast-host">
          <button className="toast" onClick={() => setError(null)}>
            {error}
          </button>
        </div>
      )}
    </div>
  );
}
