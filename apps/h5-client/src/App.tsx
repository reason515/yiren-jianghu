import { useCallback, useEffect, useState, type JSX } from "react";
import { createAuthApi, type AuthApi, type AuthSession } from "./lib/authApi.js";
import { createApiClient, type ApiClient } from "./lib/apiClient.js";
import { LoginPage } from "./components/LoginPage.js";
import { CharacterCreateSheet } from "./components/CharacterCreateSheet.js";
import { SceneView } from "./components/SceneView.js";
import type { SceneRoom } from "./lib/sceneTypes.js";

/**
 * H5 应用组装（M3 客户端闭环）：
 * 未登录 → LoginPage；有 token 无角色 → CharacterCreateSheet；有角色 → 场景主界面 + 面板导航。
 * 服务端权威：客户端只发意图、渲染事件；断线重连走 ReconnectingOverlay + resume。
 */

const BASE_URL = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api";
const TOKEN_KEY = "yjh.token";

type Panel = "none" | "character" | "afk" | "quests" | "forum" | "leaderboard" | "map";

function loadToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function App(): JSX.Element {
  const [token, setToken] = useState<string | null>(loadToken());
  const [booting, setBooting] = useState<boolean>(true);
  const [character, setCharacter] = useState<{ id: string; name: string } | null>(null);
  const [needCreate, setNeedCreate] = useState(false);
  const [room, setRoom] = useState<SceneRoom | null>(null);
  const [panel, setPanel] = useState<Panel>("none");
  const [error, setError] = useState<string | null>(null);

  const tokenStore = { get: () => token };
  const api: ApiClient = createApiClient(BASE_URL, tokenStore);
  const authApi: AuthApi = createAuthApi(BASE_URL);

  const notify = (e: unknown): void => setError(e instanceof Error ? e.message : String(e));

  const refreshScene = useCallback(async (): Promise<void> => {
    try {
      setRoom((await api.getScene()) as SceneRoom);
    } catch (e) {
      notify(e);
    }
  }, [api]);

  // 启动：token 有效则恢复（resume），否则回登录
  useEffect(() => {
    if (!token) {
      setBooting(false);
      return;
    }
    void (async () => {
      try {
        const res = await api.resume();
        if (res.character) {
          setCharacter({
            id: (res.character as { id: string }).id,
            name: (res.character as { name: string }).name,
          });
          setNeedCreate(false);
          await refreshScene();
        } else {
          setNeedCreate(true);
        }
      } catch {
        setToken(null);
        localStorage.removeItem(TOKEN_KEY);
      } finally {
        setBooting(false);
      }
    })();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const onLoggedIn = (session: AuthSession): void => {
    localStorage.setItem(TOKEN_KEY, session.token);
    setToken(session.token);
    void api.resume().then((res) => {
      if (res.character) {
        setCharacter({
          id: (res.character as { id: string }).id,
          name: (res.character as { name: string }).name,
        });
        setNeedCreate(false);
        void refreshScene();
      } else {
        setNeedCreate(true);
      }
    });
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
      await refreshScene();
    })();
  };

  const onGo = async (dir: string): Promise<void> => {
    try {
      setRoom((await api.move(dir)) as SceneRoom);
    } catch (e) {
      notify(e);
    }
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
    setRoom(null);
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
            onGo={(d) => void onGo(d)}
            onSelectNpc={() => undefined}
            onSelectItem={() => undefined}
            onAction={() => undefined}
          />
          <nav className="app-nav" aria-label="主功能">
            <button className="app-nav-btn" onClick={() => setPanel("character")}>
              角色
            </button>
            <button className="app-nav-btn" onClick={() => setPanel("afk")}>
              挂机
            </button>
            <button className="app-nav-btn" onClick={() => setPanel("quests")}>
              任务
            </button>
            <button className="app-nav-btn" onClick={() => setPanel("forum")}>
              论坛
            </button>
            <button className="app-nav-btn" onClick={() => setPanel("leaderboard")}>
              榜单
            </button>
            <button className="app-nav-btn" onClick={() => setPanel("map")}>
              地图
            </button>
            <button className="app-nav-btn" onClick={() => void onLogout()}>
              离开
            </button>
          </nav>
        </>
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
