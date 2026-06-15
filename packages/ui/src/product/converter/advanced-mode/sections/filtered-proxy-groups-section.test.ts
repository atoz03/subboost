import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captures: {} as Record<string, any>,
  store: {} as Record<string, any>,
  interactions: {
    proxyGroupAdded: vi.fn(),
  },
  toast: vi.fn(),
}));

const stateMock = vi.hoisted(() => ({
  enabled: false,
  callIndex: 0,
  overrides: {} as Record<number, unknown>,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (!stateMock.enabled) return actual.useState(initial);
      const index = stateMock.callIndex++;
      const value = Object.prototype.hasOwnProperty.call(stateMock.overrides, index) ? stateMock.overrides[index] : initial;
      const setter = vi.fn((next: unknown) => {
        const resolved = typeof next === "function" ? (next as (prev: unknown) => unknown)(value) : next;
        (setter as any).lastValue = resolved;
        return resolved;
      });
      stateMock.setters[index] = setter;
      return [value, setter];
    },
  };
});

vi.mock("react/jsx-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react/jsx-runtime")>();
  const capture = (type: unknown, props: Record<string, unknown> | null, key?: unknown) => {
    if (typeof type === "string") {
      (mocks.captures.intrinsics ??= []).push({ type, props: props ?? {}, key });
    }
  };
  return {
    ...actual,
    jsx: (type: unknown, props: Record<string, unknown> | null, key?: unknown) => {
      capture(type, props, key);
      return actual.jsx(type as any, props, key as any);
    },
    jsxs: (type: unknown, props: Record<string, unknown> | null, key?: unknown) => {
      capture(type, props, key);
      return actual.jsxs(type as any, props, key as any);
    },
  };
});

vi.mock("lucide-react", () => ({
  Check: () => null,
  ChevronDown: () => null,
  ChevronRight: () => null,
  Filter: () => null,
  Pencil: () => null,
  Plus: () => null,
  Shuffle: () => null,
  Trash2: () => null,
  X: () => null,
}));
vi.mock("@subboost/ui/components/ui/badge", () => ({ Badge: (props: any) => props.children }));
vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => {
    mocks.captures.buttons.push(props);
    return null;
  },
}));
vi.mock("@subboost/ui/components/ui/input", () => ({
  Input: (props: any) => {
    mocks.captures.inputs.push(props);
    return null;
  },
}));
vi.mock("@subboost/ui/components/ui/switch", () => ({
  Switch: (props: any) => {
    mocks.captures.switches.push(props);
    return null;
  },
}));
vi.mock("@subboost/ui/components/ui/toaster", () => ({ toast: mocks.toast }));
vi.mock("@subboost/core/generator/proxy-groups", () => ({
  PROXY_GROUP_MODULES: [{ id: "auto", name: "Auto", category: "core" }],
}));
vi.mock("@subboost/core/proxy-group-name", () => ({
  normalizeGroupNameWithDefaultEmoji: (raw: string, emoji: string) => ({ emoji, full: raw.startsWith(emoji) ? raw : `${emoji} ${raw}` }),
  resolveProxyGroupModuleName: (module: { name: string }, override?: string) => override || module.name,
  splitLeadingEmoji: (name: string) => {
    const match = name.match(/^(\p{Emoji_Presentation})\s*(.*)$/u);
    return match ? { hasEmojiPrefix: true, emoji: match[1], label: match[2] } : { hasEmojiPrefix: false, emoji: "", label: name };
  },
}));
vi.mock("@subboost/core/filtered-proxy-groups", () => ({
  REGION_PRESETS: [{ id: "hk", emoji: "HK", label: "香港", keywords: ["hong kong"] }],
  getFilteredProxyGroupNodeNames: (_nodes: unknown[], group: any) => (group.enabled ? ["Alpha", "Beta"] : []),
}));
vi.mock("@subboost/core/types/config", () => ({ DEFAULT_LOAD_BALANCE_STRATEGY: "consistent-hashing" }));
vi.mock("@subboost/ui/lib/utils", () => ({ cn: (...parts: unknown[]) => parts.filter(Boolean).join(" ") }));
vi.mock("@subboost/ui/store/config-store", () => ({ useConfigStore: () => mocks.store }));
vi.mock("@subboost/ui/product/converter/source-display-label", () => ({
  buildSourceDisplayLabel: ({ typeLabel, order, total, tag }: any) => `${typeLabel} ${order}/${total}${tag ? ` ${tag}` : ""}`,
}));
vi.mock("@subboost/ui/product/interactions", () => ({ useProductInteractionAdapter: () => mocks.interactions }));
vi.mock("../constants", () => ({
  sourceTypeInfo: {
    url: { label: "订阅链接" },
    yaml: { label: "YAML 配置" },
    nodes: { label: "节点链接" },
  },
}));
vi.mock("../section-header", () => ({
  SectionHeader: (props: any) => {
    mocks.captures.header = props;
    return null;
  },
}));
vi.mock("./proxy-group-rule-targets", () => ({
  buildManualRuleTargets: vi.fn(() => [{ name: "Auto" }]),
  listCustomRulesForTarget: (_rules: any[], target: string) =>
    target === "Filtered" ? [{ rule: { id: "rule-1" }, index: 0 }] : [],
}));
vi.mock("./proxy-group-rule-row", () => ({
  ProxyGroupManualRuleRow: (props: any) => {
    mocks.captures.manualRows.push(props);
    return null;
  },
}));
vi.mock("./proxy-group-type-menu", () => ({
  ProxyGroupTypeMenu: (props: any) => {
    mocks.captures.typeMenus.push(props);
    return null;
  },
  getLoadBalanceStrategyLabel: (value: string) => `strategy:${value}`,
  getProxyGroupTypeLabel: (value: string) => `type:${value}`,
}));

import { FilteredProxyGroupsSection } from "./filtered-proxy-groups-section";
import { PROXY_GROUP_EMOJI_LIBRARY } from "./proxy-group-name-editor";

const group = {
  id: "fg1",
  emoji: "🧩",
  name: "Filtered",
  enabled: true,
  groupType: "select",
  strategy: "consistent-hashing",
  sourceIds: ["s1"],
  regions: ["hk"],
  includeRegex: "HK",
  excludeRegex: "test",
  excludedNodeNames: ["Beta", "Beta", ""],
};

function renderSection(overrides: Record<number, unknown> = {}, props = { isExpanded: true, onToggle: vi.fn() }) {
  stateMock.enabled = true;
  stateMock.callIndex = 0;
  stateMock.overrides = overrides;
  stateMock.setters = [];
  mocks.captures.buttons = [];
  mocks.captures.inputs = [];
  mocks.captures.switches = [];
  mocks.captures.manualRows = [];
  mocks.captures.typeMenus = [];
  mocks.captures.intrinsics = [];
  try {
    const html = renderToStaticMarkup(React.createElement(FilteredProxyGroupsSection, props));
    return { html, setters: stateMock.setters };
  } finally {
    stateMock.enabled = false;
  }
}

function textOf(children: unknown): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(textOf).join("");
  if (React.isValidElement(children)) return textOf((children.props as { children?: unknown }).children);
  return "";
}

function findIntrinsic(type: string, predicate: (props: any) => boolean) {
  const found = mocks.captures.intrinsics.find((item: any) => item.type === type && predicate(item.props));
  expect(found).toBeTruthy();
  return found.props;
}

describe("FilteredProxyGroupsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.captures = { buttons: [], inputs: [], switches: [], manualRows: [], typeMenus: [], intrinsics: [] };
    mocks.store = {
      sources: [
        { id: "s1", type: "url", tag: "HK" },
        { id: "s2", type: "nodes", tag: "" },
      ],
      nodes: [{ name: "Alpha" }, { name: "Beta" }],
      enabledProxyGroups: ["auto"],
      hiddenProxyGroups: [],
      customRules: [{ id: "rule-1", target: "Filtered" }],
      filteredProxyGroups: [group],
      customProxyGroups: [{ name: "🧩 Auto", rules: [] }],
      dialerProxyGroups: [{ name: "Dialer" }],
      proxyGroupNameOverrides: {},
      addFilteredProxyGroup: vi.fn(),
      removeFilteredProxyGroup: vi.fn(),
      updateFilteredProxyGroup: vi.fn(),
      updateCustomRule: vi.fn(),
      removeCustomRule: vi.fn(),
    };
  });

  it("renders expanded groups and updates filters, type, and manual rules", () => {
    const { html } = renderSection({ 0: new Set(["fg1"]) });

    expect(mocks.captures.header).toEqual(expect.objectContaining({ title: "筛选代理组", isExpanded: true }));
    expect(mocks.captures.switches[0]).toEqual(expect.objectContaining({ checked: true }));
    expect(mocks.captures.typeMenus[0]).toEqual(expect.objectContaining({ value: "select", strategy: "consistent-hashing" }));
    expect(html).toContain("text-amber-300");
    expect(html).toContain("text-sky-300");
    expect(html).toContain("text-indigo-300");
    expect(html).toContain("text-emerald-300");

    const includeInput = mocks.captures.inputs.find((props: any) => props.value === "HK");
    includeInput.onChange({ target: { value: "IEPL" } });
    expect(mocks.store.updateFilteredProxyGroup).toHaveBeenCalledWith("fg1", { includeRegex: "IEPL" });

    const excludeInput = mocks.captures.inputs.find((props: any) => props.value === "test");
    excludeInput.onChange({ target: { value: "过期" } });
    expect(mocks.store.updateFilteredProxyGroup).toHaveBeenCalledWith("fg1", { excludeRegex: "过期" });

    mocks.captures.typeMenus[0].onChange({ groupType: "load-balance", strategy: "round-robin" });
    expect(mocks.store.updateFilteredProxyGroup).toHaveBeenCalledWith("fg1", {
      groupType: "load-balance",
      strategy: "round-robin",
    });

    mocks.captures.manualRows[0].onMove({ rule: { id: "rule-1" }, index: 0 }, { name: "Auto" });
    expect(mocks.store.updateCustomRule).toHaveBeenCalledWith("rule-1", { target: "Auto" });
    mocks.captures.manualRows[0].onRemove({ index: 0 });
    expect(mocks.store.removeCustomRule).toHaveBeenCalledWith(0);

    findIntrinsic("button", (props) => textOf(props.children).includes("订阅链接 1/2 HK")).onClick();
    expect(mocks.store.updateFilteredProxyGroup).toHaveBeenCalledWith("fg1", { sourceIds: [] });

    findIntrinsic("button", (props) => textOf(props.children).includes("节点链接 2/2")).onClick();
    expect(mocks.store.updateFilteredProxyGroup).toHaveBeenCalledWith("fg1", { sourceIds: ["s1", "s2"] });

    findIntrinsic("button", (props) => props.title === "关键词: hong kong").onClick();
    expect(mocks.store.updateFilteredProxyGroup).toHaveBeenCalledWith("fg1", { regions: [] });

    findIntrinsic("button", (props) => props.title === "排除该节点").onClick({ stopPropagation: vi.fn() });
    expect(mocks.store.updateFilteredProxyGroup).toHaveBeenCalledWith("fg1", {
      excludedNodeNames: ["Beta", "Alpha"],
    });

    findIntrinsic("button", (props) => textOf(props.children) === "全部恢复").onClick({ stopPropagation: vi.fn() });
    expect(mocks.store.updateFilteredProxyGroup).toHaveBeenCalledWith("fg1", { excludedNodeNames: [] });

    findIntrinsic("button", (props) => props.title === "恢复该节点").onClick({ stopPropagation: vi.fn() });
    expect(mocks.store.updateFilteredProxyGroup).toHaveBeenCalledWith("fg1", { excludedNodeNames: [] });
  });

  it("adds groups and toggles enabled state with duplicate-name protection", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.42);
    const expectedEmoji = PROXY_GROUP_EMOJI_LIBRARY[Math.floor(0.42 * PROXY_GROUP_EMOJI_LIBRARY.length)] ?? "🧩";
    renderSection({ 0: new Set(["fg1"]) });

    mocks.captures.buttons.at(-1).onClick();
    expect(mocks.store.addFilteredProxyGroup).toHaveBeenCalledWith(
      expect.objectContaining({
        emoji: expectedEmoji,
        name: expect.stringContaining(`${expectedEmoji} 筛选组`),
        enabled: true,
        groupType: "select",
        sourceIds: [],
      })
    );
    expect(mocks.interactions.proxyGroupAdded).toHaveBeenCalledWith({ groupType: "filtered_select" });

    mocks.captures.switches[0].onCheckedChange(false);
    expect(mocks.store.updateFilteredProxyGroup).toHaveBeenCalledWith("fg1", { enabled: false });

    mocks.captures.buttons.find((props: any) => props.title === "删除").onClick();
    expect(mocks.store.removeFilteredProxyGroup).toHaveBeenCalledWith("fg1");

    mocks.store.filteredProxyGroups = [{ ...group, enabled: false, name: "🧩 Auto" }];
    renderSection();
    mocks.captures.switches[0].onCheckedChange(true);
    expect(mocks.store.updateFilteredProxyGroup).toHaveBeenCalledWith("fg1", { enabled: true, name: "🧩 Auto (2)" });
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "筛选组名称已自动调整以避免重复", variant: "warning" }));
    randomSpy.mockRestore();
  });

  it("renames, cancels, and renders collapsed or empty states", () => {
    const { setters } = renderSection({ 0: new Set(["fg1"]), 1: "fg1", 2: { emoji: "🧩", name: "Auto" } });

    const renameInput = mocks.captures.inputs.find((props: any) => props.placeholder === "筛选组");
    renameInput.onChange({ target: { value: "Typed" } });
    expect(setters[2]).toHaveBeenCalledWith({ emoji: "🧩", name: "Typed" });
    renameInput.onKeyDown({ key: "Enter" });
    expect(mocks.store.updateFilteredProxyGroup).toHaveBeenCalledWith("fg1", { emoji: "🧩", name: "🧩 Auto (2)" });
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "筛选组名称已自动调整以避免重复" }));

    renameInput.onKeyDown({ key: "Escape" });
    expect(setters[1]).toHaveBeenCalledWith(null);

    mocks.captures.buttons.find((props: any) => props.title === "取消").onClick();
    expect(setters[2]).toHaveBeenCalledWith({ emoji: "🧩", name: "" });

    findIntrinsic("div", (props) => typeof props.className === "string" && props.className.includes("cursor-pointer")).onClick();
    expect(setters[0]).not.toHaveBeenCalled();

    renderSection({}, { isExpanded: false, onToggle: vi.fn() });
    expect(mocks.captures.header).toEqual(expect.objectContaining({ isExpanded: false }));

    mocks.store.filteredProxyGroups = [];
    renderSection();
    expect(mocks.captures.switches).toEqual([]);
    expect(mocks.captures.buttons.at(-1)).toEqual(expect.objectContaining({ variant: "outline" }));
  });

  it("toggles group expansion and increments unique suffixes beyond the first duplicate", () => {
    let result = renderSection();
    findIntrinsic("div", (props) => typeof props.className === "string" && props.className.includes("cursor-pointer")).onClick();
    expect((result.setters[0] as any).lastValue).toEqual(new Set(["fg1"]));

    result = renderSection({ 0: new Set(["fg1"]) });
    findIntrinsic("div", (props) => typeof props.className === "string" && props.className.includes("cursor-pointer")).onClick();
    expect((result.setters[0] as any).lastValue).toEqual(new Set());

    mocks.store.customProxyGroups = [{ name: "🧩 Auto" }, { name: "🧩 Auto (2)" }];
    renderSection({ 0: new Set(["fg1"]), 1: "fg1", 2: { emoji: "🧩", name: "Auto" } });
    mocks.captures.buttons.find((props: any) => props.title === "保存").onClick();
    expect(mocks.store.updateFilteredProxyGroup).toHaveBeenCalledWith("fg1", {
      emoji: "🧩",
      name: "🧩 Auto (3)",
    });
  });

  it("covers summary variants, rename entry, and unselected region/source branches", () => {
    mocks.store.filteredProxyGroups = [
      {
        ...group,
        emoji: "",
        name: "Plain",
        enabled: false,
        groupType: "load-balance",
        strategy: undefined,
        sourceIds: [],
        regions: [],
        excludedNodeNames: [],
      },
    ];
    const { html, setters } = renderSection({ 0: new Set(["fg1"]) });

    expect(html).toContain("type:load-balance/strategy:consistent-hashing");
    expect(html).toContain("全部源");
    expect(html).toContain("全部地区");
    expect(html).not.toContain("停用");
    expect(html).toContain("Alpha");
    expect(html).toContain("Beta");

    mocks.captures.buttons.find((props: any) => props.title === "改名").onClick({ stopPropagation: vi.fn() });
    expect(setters[1]).toHaveBeenCalledWith("fg1");
    expect(setters[2]).toHaveBeenCalledWith({ emoji: "", name: "Plain" });

    findIntrinsic("button", (props) => textOf(props.children).includes("订阅链接 1/2 HK")).onClick();
    expect(mocks.store.updateFilteredProxyGroup).toHaveBeenCalledWith("fg1", { sourceIds: ["s1"] });

    findIntrinsic("button", (props) => props.title === "关键词: hong kong").onClick();
    expect(mocks.store.updateFilteredProxyGroup).toHaveBeenCalledWith("fg1", { regions: ["hk"] });

    findIntrinsic(
      "div",
      (props) => typeof props.className === "string" && props.className.includes("flex shrink-0 items-center justify-end")
    ).onClick({
      stopPropagation: vi.fn(),
    });
  });

  it("uses fallback names and default values when optional group fields are empty", () => {
    mocks.store.customProxyGroups = [{ name: "" }, { name: 123 as any }];
    mocks.store.dialerProxyGroups = [{ name: "" }, { name: null as any }];
    mocks.store.filteredProxyGroups = [
      {
        ...group,
        emoji: "",
        name: "Plain",
        groupType: undefined,
        strategy: undefined,
        sourceIds: [],
        regions: [],
        includeRegex: undefined,
        excludeRegex: undefined,
        excludedNodeNames: null as any,
      },
    ];
    const result = renderSection({ 0: new Set(["fg1"]), 1: "fg1", 2: { emoji: "🧩", name: "Fresh" } });

    expect(mocks.captures.inputs.find((props: any) => props.placeholder === "例如: (IEPL|专线|家宽)").value).toBe("");
    expect(mocks.captures.inputs.find((props: any) => props.placeholder === "例如: (测试|过期)").value).toBe("");
    expect(mocks.captures.typeMenus[0]).toEqual(expect.objectContaining({ value: "select", strategy: undefined }));

    mocks.captures.typeMenus[0].onChange({ groupType: "select", strategy: "round-robin" });
    expect(mocks.store.updateFilteredProxyGroup).toHaveBeenCalledWith("fg1", { groupType: "select", strategy: undefined });

    mocks.captures.typeMenus[0].onChange({ groupType: "load-balance", strategy: undefined });
    expect(mocks.store.updateFilteredProxyGroup).toHaveBeenCalledWith("fg1", {
      groupType: "load-balance",
      strategy: "consistent-hashing",
    });

    mocks.toast.mockClear();
    mocks.captures.buttons.find((props: any) => props.title === "保存").onClick();
    expect(mocks.store.updateFilteredProxyGroup).toHaveBeenCalledWith("fg1", { emoji: "🧩", name: "🧩 Fresh" });
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(result.setters[1]).toHaveBeenCalledWith(null);
    expect(result.setters[2]).toHaveBeenCalledWith({ emoji: "🧩", name: "" });
  });
});
