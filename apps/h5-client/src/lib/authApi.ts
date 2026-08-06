/** 服务端错误（统一错误信封 → 前端可读）。 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface AuthSession {
  accountId: string;
  token: string;
}

export interface CreateCharacterInput {
  name: string;
  gender: "male" | "female";
  attrs: { str: number; int: number; con: number; dex: number };
}

export interface AuthApi {
  login(inviteCode: string): Promise<AuthSession>;
  createCharacter(token: string, input: CreateCharacterInput): Promise<{ characterId: string }>;
  discardCharacter(token: string): Promise<{ ok: true }>;
}

/** API 客户端工厂（fetch 可注入，便于单测与 Taro 适配层替换）。 */
export function createAuthApi(baseUrl: string, fetchImpl: typeof fetch = fetch): AuthApi {
  const request = async <T>(
    path: string,
    opts: { method?: string; token?: string; body?: unknown } = {},
  ): Promise<T> => {
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method: opts.method ?? "GET",
      headers: {
        "content-type": "application/json",
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
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

  return {
    login: (inviteCode) =>
      request<AuthSession>("/auth/login", { method: "POST", body: { inviteCode } }),
    createCharacter: (token, input) =>
      request<{ characterId: string }>("/characters", { method: "POST", token, body: input }),
    discardCharacter: (token) =>
      request<{ ok: true }>("/characters/discard", { method: "POST", token }),
  };
}
