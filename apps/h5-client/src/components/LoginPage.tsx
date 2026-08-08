import { useEffect, useRef, useState, type JSX } from "react";
import type { ApiError } from "../lib/authApi.js";
import type { AuthApi, AuthSession } from "../lib/authApi.js";

/** 记住上次成功登录的邀请码：同帖即同账号（服务端幂等绑定），方便测试与日常回档。 */
const LAST_INVITE_KEY = "yjh.lastInvite";

/** 开场卷轴只播一次（同设备/浏览器），播过即记住，不再打扰。 */
const PROLOGUE_SEEN_KEY = "yjh.prologueSeen";

function loadLastInvite(): string {
  try {
    return localStorage.getItem(LAST_INVITE_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveLastInvite(code: string): void {
  try {
    localStorage.setItem(LAST_INVITE_KEY, code);
  } catch {
    // 存储不可用（隐私模式等）时忽略，不影响登录。
  }
}

function loadPrologueSeen(): boolean {
  try {
    return localStorage.getItem(PROLOGUE_SEEN_KEY) === "1";
  } catch {
    // 存储不可用时视为已看过，不阻塞登录。
    return true;
  }
}

function markPrologueSeen(): void {
  try {
    localStorage.setItem(PROLOGUE_SEEN_KEY, "1");
  } catch {
    // 存储不可用时忽略。
  }
}

/** 开场卷轴三卷文案（短句顿挫、留白；遵循 yjh-wuxia-copywriting，竖排呈现）。 */
const PROLOGUE_PAGES = [
  {
    num: "壹",
    title: "无门",
    cols: ["江湖本无门", "恩怨多了", "便成了江湖"],
    mood: "天地未名 · 山河无主",
  },
  {
    num: "贰",
    title: "孤身",
    cols: ["一人一帖", "一程风雪", "此去千里", "无人同行"],
    mood: "孤身入世 · 剑随人走",
  },
  {
    num: "叁",
    title: "叩门",
    cols: ["帖上无字", "门后有山", "叩响它", "你的江湖", "从此开始"],
    mood: "一人一江湖",
  },
] as const;

/** 登录页（H5 邀请码登录；水墨远景 + 开场卷轴；文案遵循 yjh-wuxia-copywriting）。 */
export interface LoginPageProps {
  api: AuthApi;
  onLoggedIn: (session: AuthSession) => void;
}

export function LoginPage({ api, onLoggedIn }: LoginPageProps): JSX.Element {
  const [invite, setInvite] = useState(loadLastInvite);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPrologue, setShowPrologue] = useState(() => !loadPrologueSeen());
  const [prologueIdx, setPrologueIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!showPrologue) {
      inputRef.current?.focus();
    }
  }, [showPrologue]);

  const dismissPrologue = (): void => {
    markPrologueSeen();
    setShowPrologue(false);
  };

  const advancePrologue = (): void => {
    if (prologueIdx < PROLOGUE_PAGES.length - 1) {
      setPrologueIdx(prologueIdx + 1);
    } else {
      dismissPrologue();
    }
  };

  const submit = async (): Promise<void> => {
    const code = invite.trim();
    if (!code) {
      setError("请先填上邀请帖号。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const session = await api.login(code);
      saveLastInvite(code);
      onLoggedIn(session);
    } catch (err) {
      const e = err as ApiError;
      setError(e instanceof Error ? e.message : "叩门失败，请稍后再试。");
    } finally {
      setBusy(false);
    }
  };

  const page = PROLOGUE_PAGES[prologueIdx]!;

  return (
    <div className="auth-page" data-testid="login-page">
      {/* 水墨远景：孤月、疏星、层山、雾、独行人影（纯 CSS/SVG，无外部资源） */}
      <div className="auth-vista" aria-hidden="true">
        <div className="auth-stars" />
        <div className="auth-moon" />
        <div className="auth-horizon" />
        <div className="auth-range back" />
        <div className="auth-range mid" />
        <div className="auth-range front" />
        {/* 月光洒落：山坳里的一层暖光，破底部死黑 */}
        <div className="auth-lights" aria-hidden="true" />
        {/* 月下孤影：前景右下，背朝观者望月；近大远小；剑穗一点朱砂，呼应印章 */}
        <div className="auth-figure">
          <svg viewBox="0 0 24 72" aria-hidden="true">
            <path d="M18.5 6.5 L21 10.5 L16.6 11.4 Z" fill="#c45c4a" opacity="1" />
            <path d="M18.7 7.2 L20.4 9.8 L17.4 10.4 Z" fill="#e08a74" opacity="0.85" />
            <circle cx="16.7" cy="7.6" r="1.1" fill="var(--gold)" opacity="0.95" />
            <path
              d="M18 8 L20.5 30"
              stroke="currentColor"
              strokeWidth="1.6"
              fill="none"
              opacity="0.9"
            />
            <circle cx="9.6" cy="7.8" r="5.4" fill="currentColor" />
            <path d="M2 72 L5.6 36 Q9.6 30.5 13.6 36 L17.2 72 Z" fill="currentColor" />
            <path d="M11.4 33.5 Q16.4 29.5 18.6 36 L15 40 Z" fill="currentColor" opacity="0.92" />
          </svg>
        </div>
        {/* 前景松柏：压住左下角落；松下挂一盏灯，添江湖人气 */}
        <svg className="auth-pine auth-pine-l" viewBox="0 0 40 90" aria-hidden="true">
          <path d="M20 90 L20 60" stroke="currentColor" strokeWidth="3" fill="none" />
          <path d="M6 66 L20 32 L34 66 Z" fill="currentColor" />
          <path d="M10 78 L20 50 L30 78 Z" fill="currentColor" />
        </svg>
        <div className="auth-lantern" aria-hidden="true" />
        <div className="auth-mist m1" />
        <div className="auth-mist m2" />
        <div className="auth-vignette" />
      </div>

      <div className="auth-content">
        <div className="auth-seal">江湖</div>
        <h1 className="auth-title">一人江湖</h1>
        <p className="auth-sub">一帖一江湖</p>
        <p className="auth-desc">
          你听过的江湖，都是别人的。
          <br />
          这一扇门后，是你的。
        </p>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            ref={inputRef}
            className="input"
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
            placeholder="输入邀请帖号"
            aria-label="邀请帖号"
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
          />
          {invite && !error && <p className="field-hint">上次帖号已记下——同帖再入，仍是故人。</p>}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? "叩门中…" : "叩门"}
          </button>
        </form>
        <p className="auth-foot">凭帖而来 · 一人一江湖</p>
      </div>

      {showPrologue && (
        <div
          className="prologue-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="开场卷轴"
          tabIndex={0}
          onClick={advancePrologue}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              dismissPrologue();
            }
          }}
        >
          <button
            type="button"
            className="prologue-skip"
            onClick={(e) => {
              e.stopPropagation();
              dismissPrologue();
            }}
          >
            略过
          </button>
          <div className="prologue-scroll">
            <div className="p-head">
              <span className="p-roll">卷{page.num}</span>
              <span className="p-name">· {page.title}</span>
            </div>
            <div className="p-cols" key={page.num}>
              {page.cols.map((c) => (
                <p key={c} className="p-col">
                  {c}
                </p>
              ))}
            </div>
            <p className="p-mood">{page.mood}</p>
          </div>
          <div className="prologue-foot">
            <div className="p-dots" aria-hidden="true">
              {PROLOGUE_PAGES.map((p, i) => (
                <span key={p.num} className={`p-dot${i === prologueIdx ? " on" : ""}`} />
              ))}
            </div>
            <p className="p-hint">轻触翻卷 · 卷尽入门</p>
          </div>
        </div>
      )}
    </div>
  );
}
