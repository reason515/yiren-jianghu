// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { AttributeAllocator, type Attrs } from "./AttributeAllocator.js";
import { CharacterCreateSheet } from "./CharacterCreateSheet.js";
import { ConfirmSheet } from "./ConfirmSheet.js";
import { LoginPage } from "./LoginPage.js";
import type { AuthApi } from "../lib/authApi.js";

function render(ui: ReactElement): { host: HTMLDivElement; root: Root } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(ui));
  return { host, root };
}

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

function buttons(host: HTMLDivElement, aria: string): HTMLButtonElement {
  const btn = host.querySelector<HTMLButtonElement>(`button[aria-label="${aria}"]`);
  if (!btn) throw new Error(`未找到按钮 ${aria}`);
  return btn;
}

describe("AttributeAllocator", () => {
  const INIT: Attrs = { str: 20, int: 20, con: 20, dex: 20 };

  it("加减更新数值并回调 onChange；总和不超过预算", () => {
    let latest: Attrs = INIT;
    const { host } = render(
      <AttributeAllocator
        initial={INIT}
        budget={80}
        min={10}
        max={30}
        onChange={(a) => (latest = a)}
      />,
    );
    // 初始 20×4=80 已满：先减再加，验证变更与回调
    act(() => buttons(host, "膂力减").click());
    expect(latest.str).toBe(19);
    act(() => buttons(host, "膂力加").click());
    expect(latest.str).toBe(20);
    // 预算用满后（79+1=80），再加一次应被拒绝
    act(() => buttons(host, "悟性加").click());
    expect(latest.int).toBe(20);
  });

  it("上限 30 / 下限 10 禁用按钮", () => {
    const { host } = render(
      <AttributeAllocator
        initial={{ str: 30, int: 10, con: 20, dex: 20 }}
        budget={80}
        min={10}
        max={30}
        onChange={() => undefined}
      />,
    );
    expect(buttons(host, "膂力加").disabled).toBe(true);
    expect(buttons(host, "悟性减").disabled).toBe(true);
  });

  it("显示剩余点数", () => {
    const { host } = render(
      <AttributeAllocator
        initial={{ str: 20, int: 20, con: 20, dex: 20 }}
        budget={80}
        min={10}
        max={30}
        onChange={() => undefined}
      />,
    );
    expect(host.textContent).toContain("剩余可分配：0");
  });
});

describe("ConfirmSheet", () => {
  it("渲染消息；确认/取消回调", () => {
    let confirm = 0;
    let cancel = 0;
    const { host } = render(
      <ConfirmSheet
        open
        title="放下这柄剑"
        message="江湖一入深似海。你确定要放下吗？"
        confirmLabel="放下"
        onConfirm={() => (confirm += 1)}
        onCancel={() => (cancel += 1)}
      />,
    );
    expect(host.textContent).toContain("江湖一入深似海");
    act(() => host.querySelector<HTMLButtonElement>(".btn.danger")!.click());
    expect(confirm).toBe(1);
    const cancelBtn = [...host.querySelectorAll<HTMLButtonElement>(".btn")].find(
      (b) => b.textContent === "再想想",
    )!;
    act(() => cancelBtn.click());
    expect(cancel).toBe(1);
  });
});

describe("LoginPage", () => {
  it("提交邀请码调用 api.login 并回传会话", async () => {
    const api: AuthApi = {
      login: async () => ({ accountId: "acc_1", token: "tok" }),
      createCharacter: async () => ({ characterId: "c" }),
      discardCharacter: async () => ({ ok: true }),
    };
    let session: unknown = null;
    const { host } = render(<LoginPage api={api} onLoggedIn={(s) => (session = s)} />);
    const input = host.querySelector<HTMLInputElement>(".input")!;
    // React 受控 input：用原生 value setter 触发 onChange
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    act(() => {
      setter.call(input, "invite-1");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      host
        .querySelector<HTMLFormElement>(".form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(session).toEqual({ accountId: "acc_1", token: "tok" });
  });

  it("邀请码为空时提示且不调用 api", async () => {
    let called = false;
    const api: AuthApi = {
      login: async () => {
        called = true;
        return { accountId: "x", token: "x" };
      },
      createCharacter: async () => ({ characterId: "c" }),
      discardCharacter: async () => ({ ok: true }),
    };
    const { host } = render(<LoginPage api={api} onLoggedIn={() => undefined} />);
    await act(async () => {
      host
        .querySelector<HTMLFormElement>(".form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(called).toBe(false);
    expect(host.textContent).toContain("请先填上邀请帖号");
  });

  it("登录成功后记住邀请码，重进登录页自动回填并提示", async () => {
    const api: AuthApi = {
      login: async () => ({ accountId: "acc_1", token: "tok" }),
      createCharacter: async () => ({ characterId: "c" }),
      discardCharacter: async () => ({ ok: true }),
    };
    const { host, root } = render(<LoginPage api={api} onLoggedIn={() => undefined} />);
    const input = host.querySelector<HTMLInputElement>(".input")!;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    act(() => {
      setter.call(input, "invite-keep");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      host
        .querySelector<HTMLFormElement>(".form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(localStorage.getItem("yjh.lastInvite")).toBe("invite-keep");

    // 重新挂载：输入框自动回填上次帖号，并显示记忆提示
    act(() => root.unmount());
    const { host: host2 } = render(<LoginPage api={api} onLoggedIn={() => undefined} />);
    expect(host2.querySelector<HTMLInputElement>(".input")!.value).toBe("invite-keep");
    expect(host2.textContent).toContain("上次帖号已记下");
  });
});

describe("CharacterCreateSheet", () => {
  const api: AuthApi = {
    login: async () => ({ accountId: "acc_1", token: "tok" }),
    createCharacter: async () => ({ characterId: "c_1" }),
    discardCharacter: async () => ({ ok: true }),
  };

  function toForm(host: HTMLDivElement): void {
    const begin = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
      b.textContent?.includes("立名闯荡"),
    );
    if (!begin) throw new Error("未找到立名闯荡按钮");
    act(() => begin.click());
  }

  it("序章渲染故事背景与引导；立名闯荡进入表单", () => {
    const { host } = render(
      <CharacterCreateSheet
        open
        token="t"
        api={api}
        onCreated={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(host.textContent).toContain("入江湖");
    expect(host.textContent).toContain("一人一江湖");
    expect(host.textContent).toContain("城门那边");
    expect(host.querySelector<HTMLInputElement>(".input")).toBeNull();

    toForm(host);
    expect(host.textContent).toContain("立名闯江湖");
    expect(host.querySelector<HTMLInputElement>(".input")).not.toBeNull();
    expect(host.textContent).toContain("踏入江湖");
  });

  it("提交调用 api.createCharacter 并回传角色 id", async () => {
    let created = "";
    const { host } = render(
      <CharacterCreateSheet
        open
        token="t"
        api={api}
        onCreated={(id) => (created = id)}
        onClose={() => undefined}
      />,
    );
    toForm(host);
    const input = host.querySelector<HTMLInputElement>(".input")!;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    act(() => {
      setter.call(input, "叶孤舟");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      host
        .querySelector<HTMLFormElement>(".form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(created).toBe("c_1");
  });

  it("名号留空时提示且不调用 api", async () => {
    let called = false;
    const api2: AuthApi = {
      ...api,
      createCharacter: async () => {
        called = true;
        return { characterId: "c" };
      },
    };
    const { host } = render(
      <CharacterCreateSheet
        open
        token="t"
        api={api2}
        onCreated={() => undefined}
        onClose={() => undefined}
      />,
    );
    toForm(host);
    await act(async () => {
      host
        .querySelector<HTMLFormElement>(".form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(called).toBe(false);
    expect(host.textContent).toContain("江湖路远，先立名号。");
  });

  it("回想序章可返回并再次进入表单", () => {
    const { host } = render(
      <CharacterCreateSheet
        open
        token="t"
        api={api}
        onCreated={() => undefined}
        onClose={() => undefined}
      />,
    );
    toForm(host);
    const back = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
      b.textContent?.includes("回想序章"),
    )!;
    act(() => back.click());
    expect(host.textContent).toContain("入江湖");
    toForm(host);
    expect(host.textContent).toContain("立名闯江湖");
  });
});
