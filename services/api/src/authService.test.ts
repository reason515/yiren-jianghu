import { describe, expect, it } from "vitest";
import { createAuthService, AuthError } from "./authService.js";
import { createApp } from "./app.js";
import type { Db, DbRow } from "./db.js";

/** 内存 mock DB：记录表状态并响应常见查询。 */
function mockDb() {
  const state = {
    accounts: [] as Array<{ id: string; invite_code?: string }>,
    sessions: [] as Array<{ token: string; account_id: string; expires_at: string }>,
  };
  const db: Db = {
    async query<T extends DbRow>(text: string, params: unknown[] = []): Promise<{ rows: T[] }> {
      if (text.includes("FROM accounts WHERE invite_code")) {
        const rows = state.accounts
          .filter((a) => a.invite_code === params[0])
          .map((a) => ({ id: a.id }));
        return { rows: rows as unknown as T[] };
      }
      if (text.includes("INSERT INTO accounts")) {
        const id = `acc_${state.accounts.length + 1}`;
        state.accounts.push({ id, invite_code: String(params[0]) });
        return { rows: [{ id }] as unknown as T[] };
      }
      if (text.includes("INSERT INTO sessions")) {
        state.sessions.push({
          token: String(params[0]),
          account_id: String(params[1]),
          expires_at: String(params[2]),
        });
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("DELETE FROM sessions")) {
        const idx = state.sessions.findIndex((s) => s.token === params[0]);
        if (idx >= 0) state.sessions.splice(idx, 1);
        return { rows: [] as unknown as T[] };
      }
      if (text.includes("SELECT account_id, expires_at FROM sessions")) {
        const rows = state.sessions
          .filter((s) => s.token === params[0])
          .map((s) => ({ account_id: s.account_id, expires_at: s.expires_at }));
        return { rows: rows as unknown as T[] };
      }
      return { rows: [] as unknown as T[] };
    },
  };
  return { db, state };
}

const CODES = ["inv-1", "inv-2"];

describe("authService.login", () => {
  it("幂等：同一邀请码两次登录绑定同一账号，签发不同 token", async () => {
    const { db, state } = mockDb();
    const auth = createAuthService({ db, inviteCodes: CODES, now: () => 1_000_000 });
    const first = await auth.login("inv-1");
    const second = await auth.login("inv-1");
    expect(first.accountId).toBe(second.accountId);
    expect(first.token).not.toBe(second.token);
    expect(state.accounts.length).toBe(1);
    expect(state.sessions.length).toBe(2);
  });

  it("无效邀请码 → AuthError invalid_invite", async () => {
    const { db } = mockDb();
    const auth = createAuthService({ db, inviteCodes: CODES });
    await expect(auth.login("bad")).rejects.toBeInstanceOf(AuthError);
  });

  it("不同邀请码 → 不同账号", async () => {
    const { db, state } = mockDb();
    const auth = createAuthService({ db, inviteCodes: CODES });
    const a = await auth.login("inv-1");
    const b = await auth.login("inv-2");
    expect(a.accountId).not.toBe(b.accountId);
    expect(state.accounts.length).toBe(2);
  });
});

describe("authService.verifyToken", () => {
  it("有效 token 返回 accountId；过期/未知返回 null", async () => {
    const { db, state } = mockDb();
    const auth = createAuthService({ db, inviteCodes: CODES, now: () => 1_000_000 });
    const { accountId, token } = await auth.login("inv-1");
    // 手动把会话改为已过期
    state.sessions[0]!.expires_at = new Date(1_000_000 - 1).toISOString();
    expect(await auth.verifyToken(token)).toBeNull();

    state.sessions[0]!.expires_at = new Date(2_000_000).toISOString();
    expect(await auth.verifyToken(token)).toEqual({ accountId });
    expect(await auth.verifyToken("ghost")).toBeNull();
  });
});

describe("app 集成（真实 login 路由 + 鉴权走会话表）", () => {
  it("POST /auth/login 成功与失败；受保护路由用真实 token", async () => {
    const { db } = mockDb();
    const app = await createApp({ deps: { db }, inviteCodes: CODES });
    await app.ready();

    const ok = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { inviteCode: "inv-1" },
    });
    expect(ok.statusCode).toBe(200);
    const { token } = ok.json() as { token: string };

    const bad = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { inviteCode: "bad" },
    });
    expect(bad.statusCode).toBe(401);
    expect(bad.json()).toMatchObject({ error: { code: "invalid_invite" } });

    const missing = await app.inject({ method: "POST", url: "/auth/login", payload: {} });
    expect(missing.statusCode).toBe(400);

    const authed = await app.inject({
      method: "GET",
      url: "/private",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(authed.statusCode).toBe(200);
    expect(authed.json()).toHaveProperty("accountId");

    // 登出后 token 失效
    const logout = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(logout.statusCode).toBe(200);
    const after = await app.inject({
      method: "GET",
      url: "/private",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(after.statusCode).toBe(401);

    await app.close();
  });
});
