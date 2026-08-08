import { useState, type JSX } from "react";
import type { ApiError } from "../lib/authApi.js";
import type { AuthApi, AuthSession } from "../lib/authApi.js";

/** 记住上次成功登录的邀请码：同帖即同账号（服务端幂等绑定），方便测试与日常回档。 */
const LAST_INVITE_KEY = "yjh.lastInvite";

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

/** 登录页（H5 邀请码登录；文案遵循 yjh-wuxia-copywriting）。 */
export interface LoginPageProps {
  api: AuthApi;
  onLoggedIn: (session: AuthSession) => void;
}

export function LoginPage({ api, onLoggedIn }: LoginPageProps): JSX.Element {
  const [invite, setInvite] = useState(loadLastInvite);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="auth-page" data-testid="login-page">
      <div className="auth-title">一人江湖</div>
      <p className="auth-sub">凭帖入门</p>
      <p className="auth-desc">江湖未开，非请莫入——得一张邀请帖，方可叩响这扇门。</p>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          className="input"
          value={invite}
          onChange={(e) => setInvite(e.target.value)}
          placeholder="输入邀请帖号"
          aria-label="邀请帖号"
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
        />
        {invite && !error && <p className="field-hint">上次帖号已记下，同帖再入，仍是故人。</p>}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? "叩门中…" : "入门"}
        </button>
      </form>
    </div>
  );
}
