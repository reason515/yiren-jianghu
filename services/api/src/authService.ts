import { randomBytes } from "node:crypto";
import type { Db } from "./db.js";

/** 认证错误（code 进入错误信封）。 */
export class AuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export interface AuthServiceOptions {
  db: Db;
  /** 邀请码列表（部署配置）。 */
  inviteCodes: string[];
  tokenTtlMs?: number;
  now?: () => number;
  /** 测试/自测便利：任意邀请码（含空串）放行（封测前必须关闭，见 beta-launch-checklist）。 */
  allowAnyInvite?: boolean;
}

export interface AuthService {
  /** 邀请码登录：幂等绑定账号 + 签发会话 token。 */
  login(inviteCode: string): Promise<{ accountId: string; token: string }>;
  /** 校验 token → accountId（过期/不存在返回 null）。 */
  verifyToken(token: string): Promise<{ accountId: string } | null>;
  /** 登出：吊销会话 token。 */
  logout(token: string): Promise<void>;
}

export function createAuthService(opts: AuthServiceOptions): AuthService {
  const ttlMs = opts.tokenTtlMs ?? 7 * 24 * 3600 * 1000;
  const now = opts.now ?? (() => Date.now());
  const codes = new Set(opts.inviteCodes.map((c) => c.trim()).filter(Boolean));

  return {
    async login(rawCode) {
      const code = rawCode.trim();
      if (!codes.has(code) && !opts.allowAnyInvite) {
        throw new AuthError("invalid_invite", "邀请帖无效");
      }

      const existing = await opts.db.query<{ id: string; status?: string }>(
        "SELECT id, status FROM accounts WHERE invite_code = $1",
        [code],
      );
      if (existing.rows[0]?.status === "frozen") {
        throw new AuthError("account_frozen", "此账号已冻结，请联系管理员");
      }
      let accountId = existing.rows[0]?.id;
      if (!accountId) {
        const created = await opts.db.query<{ id: string }>(
          "INSERT INTO accounts (invite_code) VALUES ($1) RETURNING id",
          [code],
        );
        accountId = created.rows[0]?.id;
        if (!accountId) throw new AuthError("account_create_failed", "创建账号失败");
      }

      const token = randomBytes(16).toString("hex");
      await opts.db.query(
        "INSERT INTO sessions (token, account_id, expires_at) VALUES ($1, $2, $3)",
        [token, accountId, new Date(now() + ttlMs).toISOString()],
      );
      return { accountId, token };
    },

    async verifyToken(token) {
      const rows = await opts.db.query<{ account_id: string; expires_at: string }>(
        "SELECT account_id, expires_at FROM sessions WHERE token = $1",
        [token],
      );
      const row = rows.rows[0];
      if (!row) return null;
      if (new Date(row.expires_at).getTime() < now()) return null;
      return { accountId: row.account_id };
    },

    async logout(token) {
      await opts.db.query("DELETE FROM sessions WHERE token = $1", [token]);
    },
  };
}
