import type { FilteredProxyGroup } from "@subboost/core/types/filtered-proxy-group";
import {
  DEFAULT_LOAD_BALANCE_STRATEGY,
  isLoadBalanceStrategy,
  type BuiltinRuleEdits,
  type CustomProxyGroup,
  type CustomRuleSet,
  type RuleSetBehavior,
} from "@subboost/core/types/config";
import { PROXY_GROUP_MODULES } from "@subboost/core/generator/proxy-groups";
import { normalizePersistedRuleOrder } from "@subboost/core/generator/rules";
import { getModuleRuleOrderKey, isPresetModuleRule } from "@subboost/core/generator/module-rules";
import { resolveProxyGroupModuleName } from "@subboost/core/proxy-group-name";
import { isValidRuleSetPathOrUrl, normalizeRuleSetPathInput } from "@subboost/core/rules/rule-model";
import type { ConfigActions, RuleSetDraft } from "../definitions";
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
  | "resetModuleRuleTarget"
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
  return PROXY_GROUP_MODULES.some((proxyModule) => proxyModule.id === moduleId);
}

function normalizeRuleSetDraft(rule: RuleSetDraft): RuleSetDraft | null {
  if (!rule || typeof rule.id !== "string" || typeof rule.path !== "string") return null;
  const id = rule.id.trim();
  const path = normalizeRuleSetPathInput(rule.path);
  if (!id || !path || !isValidRuleSetPathOrUrl(path)) return null;
  const behavior: RuleSetBehavior = rule.behavior === "ipcidr" || path.toLowerCase().startsWith("geoip/")
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

function normalizeRuleOrderForState(state: {
  enabledProxyGroups: string[];
  customRules: Parameters<typeof normalizePersistedRuleOrder>[0]["customRules"];
  customRuleSets: Parameters<typeof normalizePersistedRuleOrder>[0]["customRuleSets"];
  builtinRuleEdits: Parameters<typeof normalizePersistedRuleOrder>[0]["builtinRuleEdits"];
  proxyGroupNameOverrides: Record<string, string>;
  experimentalCnUseCnRuleSet: boolean;
  cnIpNoResolve: boolean;
  ruleOrder: string[];
}): string[] {
  return normalizePersistedRuleOrder({
    enabledModules: state.enabledProxyGroups,
    customRules: state.customRules,
    customRuleSets: state.customRuleSets,
    builtinRuleEdits: state.builtinRuleEdits,
    proxyGroupNameOverrides: state.proxyGroupNameOverrides,
    experimentalCnUseCnRuleSet: state.experimentalCnUseCnRuleSet,
    cnIpNoResolve: state.cnIpNoResolve,
    ruleOrder: state.ruleOrder,
  });
}

function resolveModuleTargetName(moduleId: string, overrides?: Record<string, string>): string | null {
  const proxyModule = PROXY_GROUP_MODULES.find((item) => item.id === moduleId);
  if (!proxyModule) return null;
  return resolveProxyGroupModuleName(proxyModule, overrides?.[moduleId]);
}

function resolveMoveTargetName(
  target: { kind: "module" | "custom"; id: string },
  customProxyGroups: CustomProxyGroup[],
  proxyGroupNameOverrides?: Record<string, string>
): string | null {
  if (target.kind === "module") return resolveModuleTargetName(target.id, proxyGroupNameOverrides);
  const group = customProxyGroups.find((item) => item.id === target.id);
  return group?.name?.trim() || null;
}

function compactBuiltinRuleEdits(edits: BuiltinRuleEdits): BuiltinRuleEdits {
  const next: BuiltinRuleEdits = {};
  for (const [key, edit] of Object.entries(edits || {})) {
    const target = typeof edit?.target === "string" ? edit.target.trim() : "";
    const enabled = edit?.enabled === false ? false : undefined;
    if (!target && enabled !== false) continue;
    next[key] = {
      ...(target ? { target } : {}),
      ...(enabled === false ? { enabled: false } : {}),
    };
  }
  return next;
}

function updateBuiltinRuleEdit(
  edits: BuiltinRuleEdits,
  key: string,
  patch: { target?: string | null; enabled?: false | true | null }
): BuiltinRuleEdits {
  const prev = edits?.[key] || {};
  const next = { ...prev };
  if ("target" in patch) {
    const target = typeof patch.target === "string" ? patch.target.trim() : "";
    if (target) next.target = target;
    else delete next.target;
  }
  if ("enabled" in patch) {
    if (patch.enabled === false) next.enabled = false;
    else delete next.enabled;
  }
  return compactBuiltinRuleEdits({ ...(edits || {}), [key]: next });
}

function retargetBuiltinRuleEdits(edits: BuiltinRuleEdits, from: string, to: string): BuiltinRuleEdits {
  if (!from || from === to) return edits;
  let changed = false;
  const next: BuiltinRuleEdits = {};
  for (const [key, edit] of Object.entries(edits || {})) {
    if (edit?.target === from) {
      next[key] = { ...edit, target: to };
      changed = true;
    } else {
      next[key] = edit;
    }
  }
  return changed ? compactBuiltinRuleEdits(next) : edits;
}

function findBuiltinRuleEditKeyByTarget(edits: BuiltinRuleEdits, target: string, ruleId: string): string | null {
  if (!target || !ruleId) return null;
  for (const [key, edit] of Object.entries(edits || {})) {
    if (edit?.target !== target) continue;
    const parts = key.split(":");
    if (parts.length !== 3 || parts[0] !== "module") continue;
    if (parts[2] === ruleId) return key;
  }
  return null;
}

function appendUniqueCustomRuleSets(
  existing: CustomRuleSet[],
  drafts: RuleSetDraft[],
  target: string
): CustomRuleSet[] {
  const seen = new Set(existing.map((item) => item.id));
  const next = [...existing];
  for (const draft of drafts) {
    const ruleSet = normalizeRuleSetDraft(draft);
    if (!ruleSet || seen.has(ruleSet.id)) continue;
    seen.add(ruleSet.id);
    next.push({ ...ruleSet, target });
  }
  return next;
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

    addModuleRules: (moduleId: string, rules: RuleSetDraft[]) => {
      const id = (moduleId || "").trim();
      if (!id) return;
      if (!Array.isArray(rules) || rules.length === 0) return;

      setAndGenerateConfig((state) => {
        const target =
          resolveModuleTargetName(id, state.proxyGroupNameOverrides) ||
          state.customProxyGroups.find((group) => group.id === id)?.name?.trim();
        if (!target) return state;
        const proxyModule = PROXY_GROUP_MODULES.find((item) => item.id === id);
        let nextBuiltinRuleEdits = state.builtinRuleEdits;
        const customDrafts: RuleSetDraft[] = [];
        for (const draft of rules) {
          const normalized = normalizeRuleSetDraft(draft);
          if (!normalized) continue;
          if (proxyModule && isPresetModuleRule(proxyModule, normalized.id)) {
            const key = getModuleRuleOrderKey(proxyModule.id, normalized.id);
            nextBuiltinRuleEdits = updateBuiltinRuleEdit(nextBuiltinRuleEdits, key, {
              enabled: true,
              target: null,
            });
            continue;
          }
          customDrafts.push(normalized);
        }
        const nextCustomRuleSets = appendUniqueCustomRuleSets(state.customRuleSets, customDrafts, target);
        if (
          nextCustomRuleSets.length === state.customRuleSets.length &&
          nextBuiltinRuleEdits === state.builtinRuleEdits
        ) return state;

        return {
          customRuleSets: nextCustomRuleSets,
          builtinRuleEdits: nextBuiltinRuleEdits,
          ruleOrder: normalizeRuleOrderForState({
            ...state,
            customRuleSets: nextCustomRuleSets,
            builtinRuleEdits: nextBuiltinRuleEdits,
          }),
        };
      });
    },

    updateModuleRule: (
      moduleId: string,
      ruleId: string,
      rule: Partial<Omit<RuleSetDraft, "id">>
    ) => {
      const id = (moduleId || "").trim();
      const rid = (ruleId || "").trim();
      if (!id || !rid) return;

      setAndGenerateConfig((state) => {
        const target =
          resolveModuleTargetName(id, state.proxyGroupNameOverrides) ||
          state.customProxyGroups.find((group) => group.id === id)?.name?.trim();
        if (!target) return state;
        const index = state.customRuleSets.findIndex((item) => item.id === rid && item.target === target);
        if (index < 0) return state;

        const normalized = normalizeRuleSetDraft({
          ...state.customRuleSets[index],
          ...rule,
          id: rid,
        });
        if (!normalized) return state;

        const nextCustomRuleSets = state.customRuleSets.map((item, itemIndex) =>
          itemIndex === index ? { ...normalized, target } : item
        );

        return {
          customRuleSets: nextCustomRuleSets,
          ruleOrder: normalizeRuleOrderForState({
            ...state,
            customRuleSets: nextCustomRuleSets,
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
        if (mod && isPresetModuleRule(mod, rid)) {
          const key = getModuleRuleOrderKey(id, rid);
          const nextBuiltinRuleEdits = updateBuiltinRuleEdit(state.builtinRuleEdits, key, { enabled: false });
          return {
            builtinRuleEdits: nextBuiltinRuleEdits,
            ruleOrder: normalizeRuleOrderForState({
              ...state,
              builtinRuleEdits: nextBuiltinRuleEdits,
            }),
          };
        }

        const target =
          resolveModuleTargetName(id, state.proxyGroupNameOverrides) ||
          state.customProxyGroups.find((group) => group.id === id)?.name?.trim();
        if (!target) return state;
        const movedBuiltinKey = findBuiltinRuleEditKeyByTarget(state.builtinRuleEdits, target, rid);
        if (movedBuiltinKey) {
          const nextBuiltinRuleEdits = updateBuiltinRuleEdit(state.builtinRuleEdits, movedBuiltinKey, { enabled: false });
          return {
            builtinRuleEdits: nextBuiltinRuleEdits,
            ruleOrder: normalizeRuleOrderForState({
              ...state,
              builtinRuleEdits: nextBuiltinRuleEdits,
            }),
          };
        }
        const nextCustomRuleSets = state.customRuleSets.filter(
          (ruleSet) => !(ruleSet.id === rid && ruleSet.target === target)
        );
        if (nextCustomRuleSets.length === state.customRuleSets.length) return state;
        return {
          customRuleSets: nextCustomRuleSets,
          ruleOrder: normalizeRuleOrderForState({
            ...state,
            customRuleSets: nextCustomRuleSets,
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
        const targetName = resolveMoveTargetName(target, state.customProxyGroups, state.proxyGroupNameOverrides);
        if (!targetName) return state;
        const sourceTarget =
          resolveModuleTargetName(sourceId, state.proxyGroupNameOverrides) ||
          state.customProxyGroups.find((group) => group.id === sourceId)?.name?.trim();
        if (!sourceTarget) return state;
        if (target.kind === "module" && targetId === sourceId) return state;

        let nextEnabledProxyGroups = state.enabledProxyGroups;

        if (target.kind === "module") {
          if (!nextEnabledProxyGroups.includes(targetId)) {
            nextEnabledProxyGroups = [...nextEnabledProxyGroups, targetId];
          }
        }

        const customRuleSetIndex = state.customRuleSets.findIndex(
          (ruleSet) => ruleSet.id === rid && ruleSet.target === sourceTarget
        );
        if (customRuleSetIndex >= 0) {
          const targetModule = target.kind === "module"
            ? PROXY_GROUP_MODULES.find((proxyModule) => proxyModule.id === targetId)
            : undefined;
          let nextBuiltinRuleEdits = state.builtinRuleEdits;
          let nextCustomRuleSets: CustomRuleSet[];
          if (targetModule && isPresetModuleRule(targetModule, rid)) {
            const targetKey = getModuleRuleOrderKey(targetModule.id, rid);
            nextBuiltinRuleEdits = updateBuiltinRuleEdit(nextBuiltinRuleEdits, targetKey, {
              enabled: true,
              target: null,
            });
            nextCustomRuleSets = state.customRuleSets.filter((_, index) => index !== customRuleSetIndex);
          } else if (
            state.customRuleSets.some(
              (ruleSet, index) =>
                index !== customRuleSetIndex &&
                ruleSet.id === rid &&
                ruleSet.target === targetName
            )
          ) {
            nextCustomRuleSets = state.customRuleSets.filter((_, index) => index !== customRuleSetIndex);
          } else {
            nextCustomRuleSets = state.customRuleSets.map((ruleSet, index) =>
              index === customRuleSetIndex ? { ...ruleSet, target: targetName } : ruleSet
            );
          }
          return {
            enabledProxyGroups: nextEnabledProxyGroups,
            customRuleSets: nextCustomRuleSets,
            builtinRuleEdits: nextBuiltinRuleEdits,
            ruleOrder: normalizeRuleOrderForState({
              ...state,
              enabledProxyGroups: nextEnabledProxyGroups,
              customRuleSets: nextCustomRuleSets,
              builtinRuleEdits: nextBuiltinRuleEdits,
            }),
          };
        }

        const movedBuiltinKey = findBuiltinRuleEditKeyByTarget(state.builtinRuleEdits, sourceTarget, rid);
        if (movedBuiltinKey) {
          const nextBuiltinRuleEdits = updateBuiltinRuleEdit(state.builtinRuleEdits, movedBuiltinKey, {
            target: targetName,
            enabled: true,
          });
          return {
            enabledProxyGroups: nextEnabledProxyGroups,
            builtinRuleEdits: nextBuiltinRuleEdits,
            ruleOrder: normalizeRuleOrderForState({
              ...state,
              enabledProxyGroups: nextEnabledProxyGroups,
              builtinRuleEdits: nextBuiltinRuleEdits,
            }),
          };
        }

        if (!sourceModule || !isPresetModuleRule(sourceModule, rid)) return state;
        const key = getModuleRuleOrderKey(sourceId, rid);
        const nextBuiltinRuleEdits = updateBuiltinRuleEdit(state.builtinRuleEdits, key, {
          target: targetName,
          enabled: true,
        });
        return {
          enabledProxyGroups: nextEnabledProxyGroups,
          builtinRuleEdits: nextBuiltinRuleEdits,
          ruleOrder: normalizeRuleOrderForState({
            ...state,
            enabledProxyGroups: nextEnabledProxyGroups,
            builtinRuleEdits: nextBuiltinRuleEdits,
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

        const key = getModuleRuleOrderKey(id, rid);
        if (state.builtinRuleEdits?.[key]?.enabled !== false) return state;
        const nextBuiltinRuleEdits = updateBuiltinRuleEdit(state.builtinRuleEdits, key, { enabled: true });
        return {
          builtinRuleEdits: nextBuiltinRuleEdits,
          ruleOrder: normalizeRuleOrderForState({
            ...state,
            builtinRuleEdits: nextBuiltinRuleEdits,
          }),
        };
      });
    },

    resetModuleRuleTarget: (moduleId: string, ruleId: string) => {
      const id = (moduleId || "").trim();
      const rid = (ruleId || "").trim();
      if (!id || !rid) return;
      setAndGenerateConfig((state) => {
        const mod = PROXY_GROUP_MODULES.find((m) => m.id === id);
        if (!mod || !isPresetModuleRule(mod, rid)) return state;
        const key = getModuleRuleOrderKey(id, rid);
        if (!state.builtinRuleEdits?.[key]?.target) return state;
        const nextBuiltinRuleEdits = updateBuiltinRuleEdit(state.builtinRuleEdits, key, { target: null });
        return {
          builtinRuleEdits: nextBuiltinRuleEdits,
          ruleOrder: normalizeRuleOrderForState({
            ...state,
            builtinRuleEdits: nextBuiltinRuleEdits,
          }),
        };
      });
    },

    restoreModuleDefaultRules: (moduleId: string) => {
      const id = (moduleId || "").trim();
      if (!id) return;
      setAndGenerateConfig((state) => {
        const proxyModule = PROXY_GROUP_MODULES.find((item) => item.id === id);
        if (!proxyModule) return state;
        let nextBuiltinRuleEdits = state.builtinRuleEdits;
        for (const rule of proxyModule.rules) {
          const key = getModuleRuleOrderKey(id, rule.id);
          if (nextBuiltinRuleEdits?.[key]?.enabled === false) {
            nextBuiltinRuleEdits = updateBuiltinRuleEdit(nextBuiltinRuleEdits, key, { enabled: true });
          }
        }
        if (nextBuiltinRuleEdits === state.builtinRuleEdits) return state;
        return {
          builtinRuleEdits: nextBuiltinRuleEdits,
          ruleOrder: normalizeRuleOrderForState({
            ...state,
            builtinRuleEdits: nextBuiltinRuleEdits,
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
        customRuleSets: (() => {
          const prev = state.proxyGroupNameOverrides?.[key];
          const oldFull = resolveProxyGroupModuleName(mod, prev);
          const newFull = value ? resolveProxyGroupModuleName(mod, value) : mod.name;
          return state.customRuleSets.map((ruleSet) =>
            ruleSet.target === oldFull ? { ...ruleSet, target: newFull } : ruleSet
          );
        })(),
        builtinRuleEdits: (() => {
          const prev = state.proxyGroupNameOverrides?.[key];
          const oldFull = resolveProxyGroupModuleName(mod, prev);
          const newFull = value ? resolveProxyGroupModuleName(mod, value) : mod.name;
          return retargetBuiltinRuleEdits(state.builtinRuleEdits, oldFull, newFull);
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
          customRuleSets: state.customRuleSets.map((ruleSet) =>
            ruleSet.target === oldFull ? { ...ruleSet, target: newFull } : ruleSet
          ),
          builtinRuleEdits: retargetBuiltinRuleEdits(state.builtinRuleEdits, oldFull, newFull),
        };
      });
    },
  };
}
