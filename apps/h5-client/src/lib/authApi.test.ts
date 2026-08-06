// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { ApiError, createAuthApi, type AuthSession } from "../lib/authApi.js";

function render(ui: ReactElement): { host: HTMLDivElement; root: Root } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(ui));
  return { host, root };
}

afterEach(() => {
  document.body.innerHTML = "";
});

/** 可控 fetch mock：按请求返回预置响应或抛错。 */
function mockFetch(
  responder: (url: string, init?: RequestInit) => { status: number; body: unknown },
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const { status, body } = responder(url, init);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }) as unknown as Response;
  }) as typeof fetch;
}

describe("authApi", () => {
  it("login 成功返回会话", async () => {
    const api = createAuthApi(
      "https://api.test",
      mockFetch(() => ({ status: 200, body: { accountId: "acc_1", token: "tok" } })),
    );
    const session = await api.login("invite-123");
    expect(session).toEqual({ accountId: "acc_1", token: "tok" });
  });

  it("错误信封映射为 ApiError（code/message）", async () => {
    const api = createAuthApi(
      "https://api.test",
      mockFetch(() => ({
        status: 401,
        body: { error: { code: "invalid_invite", message: "邀请帖无效", requestId: "r1" } },
      })),
    );
    await expect(api.login("bad")).rejects.toMatchObject({
      code: "invalid_invite",
      status: 401,
      message: "邀请帖无效",
    });
  });

  it("createCharacter 携带 Bearer token 与请求体", async () => {
    let seenUrl = "";
    let seenInit: RequestInit | undefined;
    const api = createAuthApi(
      "https://api.test",
      mockFetch((url, init) => {
        seenUrl = url;
        seenInit = init;
        return { status: 200, body: { characterId: "char_1" } };
      }),
    );
    await api.createCharacter("tok-1", {
      name: "陆小风",
      gender: "male",
      attrs: { str: 25, int: 20, con: 20, dex: 15 },
    });
    expect(seenUrl).toBe("https://api.test/characters");
    expect(seenInit?.method).toBe("POST");
    expect(seenInit?.headers).toMatchObject({ authorization: "Bearer tok-1" });
    const body = JSON.parse(String(seenInit?.body)) as { name: string; attrs: { str: number } };
    expect(body.name).toBe("陆小风");
    expect(body.attrs.str).toBe(25);
  });

  it("非 JSON 响应也抛错", async () => {
    const api = createAuthApi(
      "https://api.test",
      (async () => new Response("oops", { status: 500 })) as typeof fetch,
    );
    await expect(api.login("x")).rejects.toBeInstanceOf(ApiError);
  });
});
