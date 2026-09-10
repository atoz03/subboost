import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  buttons: [] as Array<Record<string, any>>,
  cleanups: [] as Array<() => void>,
  enabled: false,
  overrides: {} as Record<number, unknown>,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
  stateIndex: 0,
  switches: [] as Array<Record<string, any>>,
  toast: vi.fn(),
  userState: {
    fetchUser: vi.fn(),
    logout: vi.fn(),
    user: null as null | {
      username: string;
      subscriptionCount: number;
      quota: { maxSubscriptions: number };
    },
  },
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: React.EffectCallback, deps?: React.DependencyList) => {
      if (!harness.enabled) return actual.useEffect(effect, deps);
      const cleanup = effect();
      if (typeof cleanup === "function") harness.cleanups.push(cleanup);
    },
    useState: (initial: unknown) => {
      if (!harness.enabled) return actual.useState(initial);
      const index = harness.stateIndex++;
      const value = Object.prototype.hasOwnProperty.call(harness.overrides, index)
        ? harness.overrides[index]
        : initial;
      const setter = vi.fn();
      harness.setters[index] = setter;
      return [value, setter];
    },
  };
});

vi.mock("lucide-react", () => ({
  LogOut: () => React.createElement("span", null, "logout"),
  Network: () => React.createElement("span", null, "network"),
  ServerCog: () => React.createElement("span", null, "server"),
  ShieldCheck: () => React.createElement("span", null, "shield"),
  UserPlus: () => React.createElement("span", null, "user-plus"),
  Users: () => React.createElement("span", null, "users"),
}));

vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: ({ variant: _variant, ...props }: Record<string, any>) => {
    harness.buttons.push({ variant: _variant, ...props });
    return React.createElement("button", props, props.children);
  },
}));

vi.mock("@subboost/ui/components/ui/card", () => ({
  Card: (props: Record<string, any>) => React.createElement("section", props, props.children),
  CardContent: (props: Record<string, any>) => React.createElement("div", props, props.children),
  CardHeader: (props: Record<string, any>) => React.createElement("header", props, props.children),
  CardTitle: (props: Record<string, any>) => React.createElement("h2", props, props.children),
}));

vi.mock("@subboost/ui/components/ui/switch-field", () => ({
  SwitchField: (props: Record<string, any>) => {
    harness.switches.push(props);
    return React.createElement("button", {
      disabled: props.disabled,
      onClick: () => props.onCheckedChange(!props.checked),
      role: "switch",
    });
  },
}));

vi.mock("@subboost/ui/components/ui/toaster", () => ({
  toast: harness.toast,
}));

vi.mock("@subboost/ui/lib/csrf", () => ({
  withCsrfHeaders: (headers: HeadersInit = {}) => headers,
}));

vi.mock("@subboost/ui/store/user-store", () => ({
  useUserStore: () => harness.userState,
}));

import SettingsPage from "../../../local/app/dashboard/settings/page";

function response(body: unknown, ok = true) {
  return {
    ok,
    text: vi.fn(async () => JSON.stringify(body)),
    json: vi.fn(async () => body),
  } as unknown as Response;
}

function settingsFetch(...settingsResponses: Response[]) {
  let settingsIndex = 0;
  return vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === "/api/users") return response({ users: [] });
    const next = settingsResponses[settingsIndex];
    settingsIndex += 1;
    return next;
  });
}

function renderSettings(overrides: Record<number, unknown> = {}) {
  harness.enabled = true;
  harness.overrides = overrides;
  harness.stateIndex = 0;
  harness.setters = [];
  harness.cleanups = [];
  harness.buttons = [];
  harness.switches = [];
  try {
    const html = renderToStaticMarkup(React.createElement(SettingsPage));
    return {
      html,
      setters: harness.setters,
      cleanups: harness.cleanups,
      buttons: harness.buttons,
      switches: harness.switches,
    };
  } finally {
    harness.enabled = false;
  }
}

async function flushPromises() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

describe("local source-import settings interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    harness.userState = {
      fetchUser: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
      user: null,
    };
    vi.stubGlobal("window", { location: { href: "" } });
  });

  it("finishes immediately for an anonymous visitor and runs effect cleanup", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const view = renderSettings();

    expect(view.html).toContain("未登录");
    expect(view.setters[12]).toHaveBeenCalledWith(false);
    expect(view.switches[0]).toMatchObject({ disabled: true, checked: false });
    expect(fetchMock).not.toHaveBeenCalled();
    view.cleanups[0]();
  });

  it("loads a valid persisted value for an authenticated administrator", async () => {
    harness.userState.user = {
      username: "admin",
      subscriptionCount: 2,
      quota: { maxSubscriptions: 9 },
    };
    vi.stubGlobal("fetch", settingsFetch(response({ allowUnsafeSubscriptionSources: true })));

    const view = renderSettings();
    await flushPromises();

    expect(view.html).toContain("2 / 9");
    expect(view.setters[11]).toHaveBeenCalledWith(true);
    expect(view.setters[12]).toHaveBeenNthCalledWith(1, true);
    expect(view.setters[12]).toHaveBeenLastCalledWith(false);
    expect(view.setters[14]).toHaveBeenCalledWith(null);
    expect(harness.userState.fetchUser).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an unsuccessful response", response({}, false)],
    ["a malformed response", response({ allowUnsafeSubscriptionSources: "yes" })],
  ])("shows a load error for %s", async (_label, fetchResponse) => {
    harness.userState.user = {
      username: "admin",
      subscriptionCount: 0,
      quota: { maxSubscriptions: 9 },
    };
    vi.stubGlobal("fetch", settingsFetch(fetchResponse));

    const view = renderSettings();
    await flushPromises();

    expect(view.setters[14]).toHaveBeenCalledWith("加载失败，请刷新重试");
    expect(view.setters[12]).toHaveBeenLastCalledWith(false);
  });

  it("does not update state after the settings effect is cancelled", async () => {
    harness.userState.user = {
      username: "admin",
      subscriptionCount: 0,
      quota: { maxSubscriptions: 9 },
    };
    let resolveFetch!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      if (String(input) === "/api/users") return Promise.resolve(response({ users: [] }));
      return new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
    }));

    const view = renderSettings();
    view.cleanups[0]();
    resolveFetch(response({ allowUnsafeSubscriptionSources: true }));
    await flushPromises();

    expect(view.setters[11]).not.toHaveBeenCalled();
    expect(view.setters[12]).toHaveBeenCalledTimes(1);
    expect(view.setters[14]).toHaveBeenCalledTimes(1);
  });

  it("ignores a rejected settings request after cancellation", async () => {
    harness.userState.user = {
      username: "",
      subscriptionCount: 0,
      quota: { maxSubscriptions: 9 },
    };
    let rejectFetch!: (reason: Error) => void;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      if (String(input) === "/api/users") return Promise.resolve(response({ users: [] }));
      return new Promise<Response>((_resolve, reject) => {
        rejectFetch = reject;
      });
    }));

    const view = renderSettings();
    expect(view.html).toContain("未登录");
    view.cleanups[0]();
    rejectFetch(new Error("cancelled request"));
    await flushPromises();

    expect(view.setters[14]).toHaveBeenCalledTimes(1);
    expect(view.setters[12]).toHaveBeenCalledTimes(1);
  });

  it("saves a toggle and redirects after logout", async () => {
    harness.userState.user = {
      username: "admin",
      subscriptionCount: 1,
      quota: { maxSubscriptions: 9 },
    };
    const fetchMock = settingsFetch(
      response({ allowUnsafeSubscriptionSources: false }),
      response({ allowUnsafeSubscriptionSources: true }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const view = renderSettings();
    await flushPromises();
    view.switches[0].onCheckedChange(true);
    await flushPromises();
    view.buttons.find((button) => button.variant === "destructive")?.onClick();
    await flushPromises();

    expect(fetchMock).toHaveBeenLastCalledWith("/api/settings/source-import", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ allowUnsafeSubscriptionSources: true }),
    }));
    expect(view.setters[11]).toHaveBeenCalledWith(true);
    expect(view.setters[13]).toHaveBeenNthCalledWith(1, true);
    expect(view.setters[13]).toHaveBeenLastCalledWith(false);
    expect(window.location.href).toBe("/login");
  });

  it.each([
    ["an unsuccessful save", response({}, false)],
    ["a malformed save", response({ allowUnsafeSubscriptionSources: "yes" })],
  ])("rolls back %s", async (_label, patchResponse) => {
    harness.userState.user = {
      username: "admin",
      subscriptionCount: 1,
      quota: { maxSubscriptions: 9 },
    };
    const fetchMock = settingsFetch(
      response({ allowUnsafeSubscriptionSources: true }),
      patchResponse,
    );
    vi.stubGlobal("fetch", fetchMock);

    const view = renderSettings({ 11: true });
    await flushPromises();
    view.switches[0].onCheckedChange(false);
    await flushPromises();

    expect(view.setters[11]).toHaveBeenCalledWith(false);
    expect(view.setters[11]).toHaveBeenLastCalledWith(true);
    expect(view.setters[14]).toHaveBeenCalledWith("保存失败，请重试");
    expect(view.setters[13]).toHaveBeenLastCalledWith(false);
  });

  it("updates the current account, creates another account, and renders user metadata", async () => {
    harness.userState.user = {
      username: "admin",
      subscriptionCount: 2,
      quota: { maxSubscriptions: 9 },
    };
    const userRow = {
      id: "user-1",
      username: "admin",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      lastLoginAt: null,
      subscriptionCount: 2,
      templateCount: 3,
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/users" && !init?.method) return response({ users: [userRow] });
      if (String(input) === "/api/settings/source-import") {
        return response({ allowUnsafeSubscriptionSources: false });
      }
      return response({ user: userRow });
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = renderSettings({
      0: [userRow, { ...userRow, id: "user-2", username: "bob", lastLoginAt: "2026-02-01T00:00:00.000Z" }],
      2: "admin.updated",
      3: "old-password",
      4: "new-password-123",
      5: "new-password-123",
      6: "bob",
      7: "bob-password-123",
      8: "bob-password-123",
    });
    await flushPromises();

    expect(view.html).toContain("2 个订阅 / 3 个模板记录");
    expect(view.html).toContain("最近登录 -");
    expect(view.html).toContain("bob");

    view.buttons[0].onClick();
    await flushPromises();
    view.buttons[2].onClick();
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith("/api/users/me", expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({
        username: "admin.updated",
        currentPassword: "old-password",
        newPassword: "new-password-123",
        passwordConfirm: "new-password-123",
      }),
    }));
    expect(fetchMock).toHaveBeenCalledWith("/api/users", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        username: "bob",
        password: "bob-password-123",
        passwordConfirm: "bob-password-123",
      }),
    }));
    for (const index of [3, 4, 5, 6, 7, 8]) {
      expect(view.setters[index]).toHaveBeenCalledWith("");
    }
    expect(view.setters[9]).toHaveBeenLastCalledWith(false);
    expect(view.setters[10]).toHaveBeenLastCalledWith(false);
    expect(harness.toast).toHaveBeenCalledWith({ title: "账户信息已更新", variant: "success" });
    expect(harness.toast).toHaveBeenCalledWith({ title: "新账号已创建", variant: "success" });
  });

  it("reports account request failures and malformed user lists", async () => {
    harness.userState.user = {
      username: "admin",
      subscriptionCount: 0,
      quota: { maxSubscriptions: 9 },
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/users" && !init?.method) return response({ users: "invalid" });
      if (String(input) === "/api/settings/source-import") {
        return response({ allowUnsafeSubscriptionSources: false });
      }
      if (String(input) === "/api/users/me") return response({ error: "当前密码不正确" }, false);
      return response({}, false);
    });
    vi.stubGlobal("fetch", fetchMock);
    const view = renderSettings({ 2: "admin", 6: "bob" });
    await flushPromises();
    view.buttons[0].onClick();
    await flushPromises();
    view.buttons[2].onClick();
    await flushPromises();

    expect(view.setters[0]).toHaveBeenCalledWith([]);
    expect(harness.toast).toHaveBeenCalledWith({ title: "当前密码不正确", variant: "destructive" });
    expect(harness.toast).toHaveBeenCalledWith({ title: "创建失败", variant: "destructive" });
  });

  it("uses fallback account errors for non-Error rejections", async () => {
    harness.userState.user = {
      username: "admin",
      subscriptionCount: 0,
      quota: { maxSubscriptions: 9 },
    };
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      if (String(input) === "/api/settings/source-import") {
        return Promise.resolve(response({ allowUnsafeSubscriptionSources: false }));
      }
      return Promise.reject("network failure");
    }));
    const view = renderSettings({ 2: "admin", 6: "bob" });
    await flushPromises();
    view.buttons[0].onClick();
    await flushPromises();
    view.buttons[2].onClick();
    await flushPromises();

    expect(harness.toast).toHaveBeenCalledWith({ title: "加载用户列表失败", variant: "destructive" });
    expect(harness.toast).toHaveBeenCalledWith({ title: "保存失败", variant: "destructive" });
    expect(harness.toast).toHaveBeenCalledWith({ title: "创建失败", variant: "destructive" });
  });

  it("renders loading, saving, and source-error states", () => {
    harness.userState.user = {
      username: "admin",
      subscriptionCount: 0,
      quota: { maxSubscriptions: 9 },
    };
    vi.stubGlobal("fetch", settingsFetch(response({ allowUnsafeSubscriptionSources: false })));

    const saving = renderSettings({ 1: true, 12: false, 13: true, 14: "保存失败" });
    expect(saving.html).toContain("加载中...");
    expect(saving.html).toContain("保存失败");
    expect(saving.switches[0]).toMatchObject({ disabled: true });

    const idle = renderSettings({ 12: false, 13: false });
    expect(idle.switches[0]).toMatchObject({ disabled: false });
  });

  it("uses server fallbacks for failed account and user-list responses", async () => {
    harness.userState.user = {
      username: "admin",
      subscriptionCount: 0,
      quota: { maxSubscriptions: 9 },
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/settings/source-import") {
        return response({ allowUnsafeSubscriptionSources: false });
      }
      if (String(input) === "/api/users" && !init?.method) return response({}, false);
      return response({}, false);
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = renderSettings({ 2: "admin", 6: "bob" });
    await flushPromises();
    view.buttons[0].onClick();
    await flushPromises();

    expect(harness.toast).toHaveBeenCalledWith({ title: "加载用户列表失败", variant: "destructive" });
    expect(harness.toast).toHaveBeenCalledWith({ title: "保存失败", variant: "destructive" });
  });
});
