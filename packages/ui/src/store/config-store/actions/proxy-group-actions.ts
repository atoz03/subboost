import type { FilteredProxyGroup } from "@subboost/core/types/filtered-proxy-group";
import { DEFAULT_LOAD_BALANCE_STRATEGY, isLoadBalanceStrategy } from "@subboost/core/types/config";
import { PROXY_GROUP_MODULES } from "@subboost/core/generator/proxy-groups";
import { normalizePersistedRuleOrder } from "@subboost/core/generator/rules";
import {
  getModuleRuleById,
  isPresetModuleRule,
  normalizeModuleRuleExclusions,
  type ModuleRuleExclusions,
} from "@subboost/core/generator/module-rules";
import { resolveProxyGroupModuleName } from "@subboost/core/proxy-group-name";
import type { ConfigActions, ModuleRuleOverride } from "../definitions";
import type { GetState, SetAndGenerateConfig, SetState } from "../store-types";

type ProxyGroupActions = Pick<
  ConfigActions,
  | "setProxyGroupOrder"
  | "hideProxyGroup"
  | "restoreHiddenProxyGroup"
  | "addFilteredProxyGroup"
  | "removeFilteredProxyGroup"
  | "updateFilteredProxyGroup"
  | "addModuleRules"
  | "updateModuleRule"
  | "removeModuleRule"
  | "moveModuleRule"
  | "restoreModuleRule"
  | "restoreModuleDefaultRules"
  | "acceptModuleRuleEditWarning"
  | "setProxyGroupNameOverride"
  | "clearProxyGroupNameOverride"
>;

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function isBuiltinProxyGroup(moduleId: string): boolean {
  return PROXY_GROUP_MODULES.some((module) => module.id === moduleId);
}

function normalizeModuleRuleOverride(rule: ModuleRuleOverride): ModuleRuleOverride | null {
  if (!rule || typeof rule.id !== "string" || typeof rule.path !== "string") return null;
  const id = rule.id.trim();
  const path = rule.path.trim();
  if (!id || !path) return null;
  const behavior = rule.behavior === "ipcidr" || path.toLowerCase().startsWith("geoip/")
    ? "ipcidr"
    : "domain";
  return {
    id,
    name: typeof rule.name === "string" && rule.name.trim() ? rule.name.trim() : id,
    behavior,
    path,
    ...(rule.noResolve || behavior === "ipcidr" ? { noResolve: true } : {}),
  };
}

function removeRuleFromModuleOverrides(
  overrides: Record<string, ModuleRuleOverride[]>,
  moduleId: string,
  ruleId: string
): Record<string, ModuleRuleOverride[]> {
  const map = { ...(overrides || {}) };
  const next = (map[moduleId] || []).filter((rule) => rule.id !== ruleId);
  if (next.length === 0) delete map[moduleId];
  else map[moduleId] = next;
  return map;
}

function addPresetRuleExclusion(
  exclusions: ModuleRuleExclusions,
  moduleId: string,
  ruleId: string
): ModuleRuleExclusions {
  const map = normalizeModuleRuleExclusions(exclusions);
  const prev = map[moduleId] || [];
  if (prev.includes(ruleId)) return map;
  return { ...map, [moduleId]: [...prev, ruleId] };
}

function removePresetRuleExclusion(
  exclusions: ModuleRuleExclusions,
  moduleId: string,
  ruleId: string
): ModuleRuleExclusions {
  const map = normalizeModuleRuleExclusions(exclusions);
  const next = (map[moduleId] || []).filter((id) => id !== ruleId);
  if (next.length === 0) {
    const { [moduleId]: _removed, ...rest } = map;
    return rest;
  }
  return { ...map, [moduleId]: next };
}

function normalizeRuleOrderForState(state: {
  enabledProxyGroups: string[];
  customRules: Parameters<typeof normalizePersistedRuleOrder>[0]["customRules"];
  customProxyGroups: Parameters<typeof normalizePersistedRuleOrder>[0]["customProxyGroups"];
  moduleRuleOverrides: Record<string, ModuleRuleOverride[]>;
  moduleRuleExclusions: ModuleRuleExclusions;
  proxyGroupNameOverrides: Record<string, string>;
  experimentalCnUseCnRuleSet: boolean;
  cnIpNoResolve: boolean;
  ruleOrder: string[];
}): string[] {
  return normalizePersistedRuleOrder({
    enabledModules: state.enabledProxyGroups,
    customRules: state.customRules,
    customProxyGroups: state.customProxyGroups,
    moduleRuleOverrides: state.moduleRuleOverrides,
    moduleRuleExclusions: state.moduleRuleExclusions,
    proxyGroupNameOverrides: state.proxyGroupNameOverrides,
    experimentalCnUseCnRuleSet: state.experimentalCnUseCnRuleSet,
    cnIpNoResolve: state.cnIpNoResolve,
    ruleOrder: state.ruleOrder,
  });
}

export function createProxyGroupActions(
  _set: SetState,
  _get: GetState,
  setAndGenerateConfig: SetAndGenerateConfig
): ProxyGroupActions {
  return {
    setProxyGroupOrder: (order: string[]) => {
      const normalized = Array.isArray(order)
        ? order
            .filter((k) => typeof k === "string")
            .map((k) => k.trim())
            .filter(Boolean)
        : [];

      const seen = new Set<string>();
      const unique: string[] = [];
      for (const key of normalized) {
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(key);
      }

      setAndGenerateConfig(() => ({ proxyGroupOrder: unique }));
    },

    hideProxyGroup: (moduleId: string) => {
      const id = (moduleId || "").trim();
      if (!id || !isBuiltinProxyGroup(id)) return;

      setAndGenerateConfig((state) => {
        const hidden = normalizeStringList(state.hiddenProxyGroups);
        const nextHiddenProxyGroups = hidden.includes(id) ? hidden : [...hidden, id];
        const nextEnabledProxyGroups = state.enabledProxyGroups.filter((groupId) => groupId !== id);

        if (
          nextHiddenProxyGroups === state.hiddenProxyGroups &&
          nextEnabledProxyGroups.length === state.enabledProxyGroups.length
        ) {
          return state;
        }

        return {
          hiddenProxyGroups: nextHiddenProxyGroups,
          enabledProxyGroups: nextEnabledProxyGroups,
          ruleOrder: normalizeRuleOrderForState({
            ...state,
            enabledProxyGroups: nextEnabledProxyGroups,
          }),
        };
      });
    },

    restoreHiddenProxyGroup: (moduleId: string) => {
      const id = (moduleId || "").trim();
      if (!id || !isBuiltinProxyGroup(id)) return;

      setAndGenerateConfig((state) => {
        const nextHiddenProxyGroups = normalizeStringList(state.hiddenProxyGroups).filter(
          (groupId) => groupId !== id
        );
        const nextEnabledProxyGroups = state.enabledProxyGroups.includes(id)
          ? state.enabledProxyGroups
          : [...state.enabledProxyGroups, id];

        if (
          nextHiddenProxyGroups.length === state.hiddenProxyGroups.length &&
          nextEnabledProxyGroups === state.enabledProxyGroups
        ) {
          return state;
        }

        return {
          hiddenProxyGroups: nextHiddenProxyGroups,
          enabledProxyGroups: nextEnabledProxyGroups,
          ruleOrder: normalizeRuleOrderForState({
            ...state,
            enabledProxyGroups: nextEnabledProxyGroups,
          }),
        };
      });
    },

    addFilteredProxyGroup: (group: Omit<FilteredProxyGroup, "id">) => {
      const id = `filtered-group-${Date.now()}`;
      const groupType =
        group.groupType === "url-test" ||
        group.groupType === "fallback" ||
        group.groupType === "load-balance" ||
        group.groupType === "direct-first" ||
        group.groupType === "reject-first"
          ? group.groupType
          : "select";
      const strategy =
        groupType === "load-balance"
          ? isLoadBalanceStrategy(group.strategy)
            ? group.strategy
            : DEFAULT_LOAD_BALANCE_STRATEGY
          : undefined;
      const next: FilteredProxyGroup = {
        id,
        emoji: typeof group.emoji === "string" ? group.emoji : undefined,
        name: group.name,
        enabled: Boolean(group.enabled),
        groupType,
        ...(strategy ? { strategy } : {}),
        sourceIds: Array.isArray(group.sourceIds) ? group.sourceIds : [],
        regions: Array.isArray(group.regions) ? group.regions : [],
        includeRegex: typeof group.includeRegex === "string" ? group.includeRegex : undefined,
        excludeRegex: typeof group.excludeRegex === "string" ? group.excludeRegex : undefined,
        excludedNodeNames: normalizeStringList(group.excludedNodeNames),
      };

      setAndGenerateConfig((state) => ({
        filteredProxyGroups: [...state.filteredProxyGroups, next],
      }));
    },

    removeFilteredProxyGroup: (id: string) => {
      const gid = (id || "").trim();
      if (!gid) return;
      setAndGenerateConfig((state) => ({
        filteredProxyGroups: state.filteredProxyGroups.filter((g) => g.id !== gid),
      }));
    },

    updateFilteredProxyGroup: (id: string, group: Partial<FilteredProxyGroup>) => {
      const gid = (id || "").trim();
      if (!gid) return;
      setAndGenerateConfig((state) => {
        const prevGroup = state.filteredProxyGroups.find((g) => g.id === gid);
        if (!prevGroup) return state;

        const prevName = typeof prevGroup.name === "string" ? prevGroup.name : "";
        const nextName = typeof group.name === "string" ? group.name : prevName;
        const didRename = Boolean(prevName && nextName && prevName !== nextName);

        const nextFilteredProxyGroups = state.filteredProxyGroups.map((g) => {
          if (g.id !== gid) return g;

          const nextGroupType =
            group.groupType === "url-test" ||
            group.groupType === "fallback" ||
            group.groupType === "load-balance" ||
            group.groupType === "direct-first" ||
            group.groupType === "reject-first" ||
            group.groupType === "select"
              ? group.groupType
              : g.groupType;
          const nextStrategy =
            nextGroupType === "load-balance"
              ? isLoadBalanceStrategy(group.strategy)
                ? group.strategy
                : isLoadBalanceStrategy(g.strategy)
                  ? g.strategy
                  : DEFAULT_LOAD_BALANCE_STRATEGY
              : undefined;

          return {
            ...g,
            ...group,
            enabled: typeof group.enabled === "boolean" ? group.enabled : g.enabled,
            emoji: typeof group.emoji === "string" ? group.emoji : g.emoji,
            groupType: nextGroupType,
            ...(nextStrategy ? { strategy: nextStrategy } : { strategy: undefined }),
            sourceIds: Array.isArray(group.sourceIds) ? group.sourceIds : g.sourceIds,
            regions: Array.isArray(group.regions) ? group.regions : g.regions,
            includeRegex:
              typeof group.includeRegex === "string"
                ? group.includeRegex
                : group.includeRegex === undefined
                  ? g.includeRegex
                  : g.includeRegex,
            excludeRegex:
              typeof group.excludeRegex === "string"
                ? group.excludeRegex
                : group.excludeRegex === undefined
                  ? g.excludeRegex
                  : g.excludeRegex,
            excludedNodeNames: Array.isArray(group.excludedNodeNames)
              ? normalizeStringList(group.excludedNodeNames)
              : Array.isArray(g.excludedNodeNames)
                ? normalizeStringList(g.excludedNodeNames)
                : [],
          };
        });

        if (!didRename) {
          return { filteredProxyGroups: nextFilteredProxyGroups };
        }

        return {
          filteredProxyGroups: nextFilteredProxyGroups,
          // 筛选组名称可能被其他功能（自定义规则 / 中转组）引用：改名时同步更新引用，避免产生“指向不存在的组”。
          customRules: state.customRules.map((r) =>
            r.target === prevName ? { ...r, target: nextName } : r
          ),
          dialerProxyGroups: state.dialerProxyGroups.map((dg) => ({
            ...dg,
            relayNodes: Array.isArray(dg.relayNodes)
              ? dg.relayNodes.map((n) => (n === prevName ? nextName : n))
              : dg.relayNodes,
          })),
        };
      });
    },

    addModuleRules: (moduleId: string, rules: ModuleRuleOverride[]) => {
      const id = (moduleId || "").trim();
      if (!id) return;
      if (!Array.isArray(rules) || rules.length === 0) return;

      setAndGenerateConfig((state) => {
        const prev = state.moduleRuleOverrides?.[id] || [];
        const existing = new Set(prev.map((r) => r.id));
        const mod = PROXY_GROUP_MODULES.find((m) => m.id === id);
        const presetIds = new Set((mod?.rules || []).map((r) => r.id));

        const incoming: ModuleRuleOverride[] = rules
          .map((r) => normalizeModuleRuleOverride(r))
          .filter((r): r is ModuleRuleOverride => Boolean(r))
          .filter((r) => r.id && r.path && !existing.has(r.id));

        if (incoming.length === 0) return state;

        const nextModuleRuleExclusions = incoming.reduce(
          (map, rule) => removePresetRuleExclusion(map, id, rule.id),
          state.moduleRuleExclusions
        );
        const incomingOverrides = incoming.filter((rule) => !presetIds.has(rule.id));
        const nextModuleRuleOverrides =
          incomingOverrides.length > 0
            ? {
                ...(state.moduleRuleOverrides || {}),
                [id]: [...prev, ...incomingOverrides],
              }
            : state.moduleRuleOverrides;

        if (
          nextModuleRuleOverrides === state.moduleRuleOverrides &&
          nextModuleRuleExclusions === state.moduleRuleExclusions
        ) {
          return state;
        }

        return {
          moduleRuleOverrides: nextModuleRuleOverrides,
          moduleRuleExclusions: nextModuleRuleExclusions,
          ruleOrder: normalizeRuleOrderForState({
            ...state,
            moduleRuleOverrides: nextModuleRuleOverrides,
            moduleRuleExclusions: nextModuleRuleExclusions,
          }),
        };
      });
    },

    updateModuleRule: (
      moduleId: string,
      ruleId: string,
      rule: Partial<Omit<ModuleRuleOverride, "id">>
    ) => {
      const id = (moduleId || "").trim();
      const rid = (ruleId || "").trim();
      if (!id || !rid) return;

      setAndGenerateConfig((state) => {
        const prev = state.moduleRuleOverrides?.[id] || [];
        const index = prev.findIndex((item) => item.id === rid);
        if (index < 0) return state;

        const normalized = normalizeModuleRuleOverride({
          ...prev[index],
          ...rule,
          id: rid,
        });
        if (!normalized) return state;

        const nextRules = prev.map((item, itemIndex) =>
          itemIndex === index ? normalized : item
        );
        const nextModuleRuleOverrides = {
          ...(state.moduleRuleOverrides || {}),
          [id]: nextRules,
        };

        return {
          moduleRuleOverrides: nextModuleRuleOverrides,
          ruleOrder: normalizeRuleOrderForState({
            ...state,
            moduleRuleOverrides: nextModuleRuleOverrides,
          }),
        };
      });
    },

    removeModuleRule: (moduleId: string, ruleId: string) => {
      const id = (moduleId || "").trim();
      const rid = (ruleId || "").trim();
      if (!id || !rid) return;

      setAndGenerateConfig((state) => {
        const mod = PROXY_GROUP_MODULES.find((m) => m.id === id);
        if (!mod) return state;

        const isPreset = isPresetModuleRule(mod, rid);
        const isExtra = (state.moduleRuleOverrides?.[id] || []).some((rule) => rule.id === rid);
        if (!isPreset && !isExtra) return state;

        const nextModuleRuleOverrides = isExtra
          ? removeRuleFromModuleOverrides(state.moduleRuleOverrides || {}, id, rid)
          : state.moduleRuleOverrides;
        const nextModuleRuleExclusions = isPreset
          ? addPresetRuleExclusion(state.moduleRuleExclusions, id, rid)
          : state.moduleRuleExclusions;

        return {
          moduleRuleOverrides: nextModuleRuleOverrides,
          moduleRuleExclusions: nextModuleRuleExclusions,
          ruleOrder: normalizeRuleOrderForState({
            ...state,
            moduleRuleOverrides: nextModuleRuleOverrides,
            moduleRuleExclusions: nextModuleRuleExclusions,
          }),
        };
      });
    },

    moveModuleRule: (moduleId, ruleId, target) => {
      const sourceId = (moduleId || "").trim();
      const rid = (ruleId || "").trim();
      const targetId = (target?.id || "").trim();
      if (!sourceId || !rid || !targetId) return;
      if (target.kind !== "module" && target.kind !== "custom") return;

      setAndGenerateConfig((state) => {
        const sourceModule = PROXY_GROUP_MODULES.find((m) => m.id === sourceId);
        if (!sourceModule) return state;
        if (target.kind === "module" && targetId === sourceId) return state;

        const sourceRule = getModuleRuleById(sourceModule, rid, state.moduleRuleOverrides);
        const normalizedRule = sourceRule ? normalizeModuleRuleOverride(sourceRule as ModuleRuleOverride) : null;
        if (!normalizedRule) return state;

        const sourceHasPreset = isPresetModuleRule(sourceModule, rid);
        const sourceHasExtra = (state.moduleRuleOverrides?.[sourceId] || []).some((rule) => rule.id === rid);
        if (!sourceHasPreset && !sourceHasExtra) return state;

        let nextModuleRuleOverrides = sourceHasExtra
          ? removeRuleFromModuleOverrides(state.moduleRuleOverrides || {}, sourceId, rid)
          : state.moduleRuleOverrides;
        let nextModuleRuleExclusions = sourceHasPreset
          ? addPresetRuleExclusion(state.moduleRuleExclusions, sourceId, rid)
          : state.moduleRuleExclusions;
        let nextCustomProxyGroups = state.customProxyGroups;
        let nextEnabledProxyGroups = state.enabledProxyGroups;

        if (target.kind === "module") {
          const targetModule = PROXY_GROUP_MODULES.find((m) => m.id === targetId);
          if (!targetModule) return state;

          const targetHasPreset = isPresetModuleRule(targetModule, rid);
          const targetHasExtra = (nextModuleRuleOverrides?.[targetId] || []).some((rule) => rule.id === rid);

          if (targetHasPreset) {
            nextModuleRuleExclusions = removePresetRuleExclusion(nextModuleRuleExclusions, targetId, rid);
          } else if (!targetHasExtra) {
            const prev = nextModuleRuleOverrides?.[targetId] || [];
            nextModuleRuleOverrides = {
              ...(nextModuleRuleOverrides || {}),
              [targetId]: [...prev, normalizedRule],
            };
          }

          if (!nextEnabledProxyGroups.includes(targetId)) {
            nextEnabledProxyGroups = [...nextEnabledProxyGroups, targetId];
          }
        } else {
          const targetGroup = nextCustomProxyGroups.find((group) => group.id === targetId);
          if (!targetGroup) return state;

          const exists = targetGroup.rules.some((rule) => rule.id === rid);
          if (!exists) {
            const url = `${state.ruleProviderBaseUrl.replace(/\/+$/, "")}/${normalizedRule.path}`;
            nextCustomProxyGroups = nextCustomProxyGroups.map((group) =>
              group.id === targetId
                ? {
                    ...group,
                    rules: [
                      ...group.rules,
                      {
                        id: normalizedRule.id,
                        name: normalizedRule.name,
                        behavior: normalizedRule.behavior,
                        url,
                        ...(normalizedRule.noResolve ? { noResolve: true } : {}),
                      },
                    ],
                  }
                : group
            );
          }
        }

        return {
          enabledProxyGroups: nextEnabledProxyGroups,
          customProxyGroups: nextCustomProxyGroups,
          moduleRuleOverrides: nextModuleRuleOverrides,
          moduleRuleExclusions: nextModuleRuleExclusions,
          ruleOrder: normalizeRuleOrderForState({
            ...state,
            enabledProxyGroups: nextEnabledProxyGroups,
            customProxyGroups: nextCustomProxyGroups,
            moduleRuleOverrides: nextModuleRuleOverrides,
            moduleRuleExclusions: nextModuleRuleExclusions,
          }),
        };
      });
    },

    restoreModuleRule: (moduleId: string, ruleId: string) => {
      const id = (moduleId || "").trim();
      const rid = (ruleId || "").trim();
      if (!id || !rid) return;

      setAndGenerateConfig((state) => {
        const mod = PROXY_GROUP_MODULES.find((m) => m.id === id);
        if (!mod || !isPresetModuleRule(mod, rid)) return state;

        const prevExclusions = normalizeModuleRuleExclusions(state.moduleRuleExclusions);
        if (!prevExclusions[id]?.includes(rid)) return state;

        const nextModuleRuleExclusions = removePresetRuleExclusion(prevExclusions, id, rid);
        return {
          moduleRuleExclusions: nextModuleRuleExclusions,
          ruleOrder: normalizeRuleOrderForState({
            ...state,
            moduleRuleExclusions: nextModuleRuleExclusions,
          }),
        };
      });
    },

    restoreModuleDefaultRules: (moduleId: string) => {
      const id = (moduleId || "").trim();
      if (!id) return;
      setAndGenerateConfig((state) => {
        const nextModuleRuleExclusions = normalizeModuleRuleExclusions(state.moduleRuleExclusions);
        if (!nextModuleRuleExclusions[id]?.length) return state;
        delete nextModuleRuleExclusions[id];
        return {
          moduleRuleExclusions: nextModuleRuleExclusions,
          ruleOrder: normalizeRuleOrderForState({
            ...state,
            moduleRuleExclusions: nextModuleRuleExclusions,
          }),
        };
      });
    },

    acceptModuleRuleEditWarning: () => {
      setAndGenerateConfig(() => ({ moduleRuleEditWarningAccepted: true }));
    },

    setProxyGroupNameOverride: (moduleId: string, displayName: string) => {
      const key = (moduleId || "").trim();
      if (!key) return;
      const value = (displayName || "").trim();
      const mod = PROXY_GROUP_MODULES.find((m) => m.id === key);
      if (!mod || mod.category === "core") return;

      setAndGenerateConfig((state) => ({
        proxyGroupNameOverrides: (() => {
          const prev = state.proxyGroupNameOverrides || {};
          const next = { ...prev, [key]: value };
          return next;
        })(),
        customRules: (() => {
          const prev = state.proxyGroupNameOverrides?.[key];
          const oldFull = resolveProxyGroupModuleName(mod, prev);
          const newFull = value ? resolveProxyGroupModuleName(mod, value) : mod.name;
          return state.customRules.map((r) =>
            r.target === oldFull ? { ...r, target: newFull } : r
          );
        })(),
      }));
    },

    clearProxyGroupNameOverride: (moduleId: string) => {
      const key = (moduleId || "").trim();
      if (!key) return;
      const mod = PROXY_GROUP_MODULES.find((m) => m.id === key);
      if (!mod || mod.category === "core") return;

      setAndGenerateConfig((state) => {
        const prevLabel = state.proxyGroupNameOverrides?.[key];
        const oldFull = resolveProxyGroupModuleName(mod, prevLabel);
        const newFull = mod.name;

        const next = { ...(state.proxyGroupNameOverrides || {}) };
        delete next[key];
        return {
          proxyGroupNameOverrides: next,
          customRules: state.customRules.map((r) =>
            r.target === oldFull ? { ...r, target: newFull } : r
          ),
        };
      });
    },
  };
}
