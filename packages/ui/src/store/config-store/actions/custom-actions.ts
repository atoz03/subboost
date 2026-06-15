import type { CustomProxyGroup, CustomRule } from "@subboost/core/types/config";
import {
  createCustomRuleId,
  ensureCustomRuleId,
} from "@subboost/core/rules/custom-rule-utils";
import { normalizePersistedRuleOrder } from "@subboost/core/generator/rules";
import type { ConfigActions } from "../definitions";
import type { GetState, SetAndGenerateConfig, SetState } from "../store-types";

type CustomActions = Pick<
  ConfigActions,
  | "addCustomRule"
  | "addCustomRules"
  | "updateCustomRule"
  | "removeCustomRule"
  | "setRuleOrder"
  | "addCustomProxyGroup"
  | "removeCustomProxyGroup"
  | "updateCustomProxyGroup"
>;

export function createCustomActions(
  _set: SetState,
  _get: GetState,
  setAndGenerateConfig: SetAndGenerateConfig,
): CustomActions {
  return {
    addCustomRule: (rule: CustomRule) => {
      setAndGenerateConfig((state) => {
        const nextCustomRules = [
          ...state.customRules,
          ensureCustomRuleId(
            { ...rule, id: rule.id || createCustomRuleId() },
            state.customRules.length,
          ),
        ];
        return {
          customRules: nextCustomRules,
          ruleOrder: normalizePersistedRuleOrder({
            enabledModules: state.enabledProxyGroups,
            customRules: nextCustomRules,
            customProxyGroups: state.customProxyGroups,
            moduleRuleOverrides: state.moduleRuleOverrides,
            moduleRuleExclusions: state.moduleRuleExclusions,
            proxyGroupNameOverrides: state.proxyGroupNameOverrides,
            experimentalCnUseCnRuleSet: state.experimentalCnUseCnRuleSet,
            cnIpNoResolve: state.cnIpNoResolve,
            ruleOrder: state.ruleOrder,
          }),
        };
      });
    },

    addCustomRules: (rules: CustomRule[]) => {
      setAndGenerateConfig((state) => {
        if (!Array.isArray(rules) || rules.length === 0) return state;

        const nextRules = rules.map((rule, offset) =>
          ensureCustomRuleId(
            { ...rule, id: rule.id || createCustomRuleId() },
            state.customRules.length + offset,
          ),
        );
        const nextCustomRules = [...state.customRules, ...nextRules];
        return {
          customRules: nextCustomRules,
          ruleOrder: normalizePersistedRuleOrder({
            enabledModules: state.enabledProxyGroups,
            customRules: nextCustomRules,
            customProxyGroups: state.customProxyGroups,
            moduleRuleOverrides: state.moduleRuleOverrides,
            moduleRuleExclusions: state.moduleRuleExclusions,
            proxyGroupNameOverrides: state.proxyGroupNameOverrides,
            experimentalCnUseCnRuleSet: state.experimentalCnUseCnRuleSet,
            cnIpNoResolve: state.cnIpNoResolve,
            ruleOrder: state.ruleOrder,
          }),
        };
      });
    },

    updateCustomRule: (id: string, rule: Partial<Omit<CustomRule, "id">>) => {
      setAndGenerateConfig((state) => {
        const nextCustomRules = state.customRules.map((item, index) =>
          item.id === id
            ? ensureCustomRuleId({ ...item, ...rule, id: item.id }, index)
            : item,
        );
        return {
          customRules: nextCustomRules,
          ruleOrder: normalizePersistedRuleOrder({
            enabledModules: state.enabledProxyGroups,
            customRules: nextCustomRules,
            customProxyGroups: state.customProxyGroups,
            moduleRuleOverrides: state.moduleRuleOverrides,
            moduleRuleExclusions: state.moduleRuleExclusions,
            proxyGroupNameOverrides: state.proxyGroupNameOverrides,
            experimentalCnUseCnRuleSet: state.experimentalCnUseCnRuleSet,
            cnIpNoResolve: state.cnIpNoResolve,
            ruleOrder: state.ruleOrder,
          }),
        };
      });
    },

    removeCustomRule: (index: number) => {
      setAndGenerateConfig((state) => {
        const nextCustomRules = state.customRules.filter((_, i) => i !== index);
        return {
          customRules: nextCustomRules,
          ruleOrder: normalizePersistedRuleOrder({
            enabledModules: state.enabledProxyGroups,
            customRules: nextCustomRules,
            customProxyGroups: state.customProxyGroups,
            moduleRuleOverrides: state.moduleRuleOverrides,
            moduleRuleExclusions: state.moduleRuleExclusions,
            proxyGroupNameOverrides: state.proxyGroupNameOverrides,
            experimentalCnUseCnRuleSet: state.experimentalCnUseCnRuleSet,
            cnIpNoResolve: state.cnIpNoResolve,
            ruleOrder: state.ruleOrder,
          }),
        };
      });
    },

    setRuleOrder: (order: string[]) => {
      setAndGenerateConfig((state) => ({
        ruleOrder: normalizePersistedRuleOrder({
          enabledModules: state.enabledProxyGroups,
          customRules: state.customRules,
          customProxyGroups: state.customProxyGroups,
          moduleRuleOverrides: state.moduleRuleOverrides,
          moduleRuleExclusions: state.moduleRuleExclusions,
          proxyGroupNameOverrides: state.proxyGroupNameOverrides,
          experimentalCnUseCnRuleSet: state.experimentalCnUseCnRuleSet,
          cnIpNoResolve: state.cnIpNoResolve,
          ruleOrder: order,
        }),
      }));
    },

    addCustomProxyGroup: (group: Omit<CustomProxyGroup, "id">) => {
      const id = `custom-group-${Date.now()}`;
      setAndGenerateConfig((state) => {
        const nextCustomProxyGroups = [
          ...state.customProxyGroups,
          { ...group, id },
        ];
        return {
          customProxyGroups: nextCustomProxyGroups,
          ruleOrder: normalizePersistedRuleOrder({
            enabledModules: state.enabledProxyGroups,
            customRules: state.customRules,
            customProxyGroups: nextCustomProxyGroups,
            moduleRuleOverrides: state.moduleRuleOverrides,
            moduleRuleExclusions: state.moduleRuleExclusions,
            proxyGroupNameOverrides: state.proxyGroupNameOverrides,
            experimentalCnUseCnRuleSet: state.experimentalCnUseCnRuleSet,
            cnIpNoResolve: state.cnIpNoResolve,
            ruleOrder: state.ruleOrder,
          }),
        };
      });
    },

    removeCustomProxyGroup: (id: string) => {
      setAndGenerateConfig((state) => {
        const nextCustomProxyGroups = state.customProxyGroups.filter(
          (g) => g.id !== id,
        );
        return {
          customProxyGroups: nextCustomProxyGroups,
          ruleOrder: normalizePersistedRuleOrder({
            enabledModules: state.enabledProxyGroups,
            customRules: state.customRules,
            customProxyGroups: nextCustomProxyGroups,
            moduleRuleOverrides: state.moduleRuleOverrides,
            moduleRuleExclusions: state.moduleRuleExclusions,
            proxyGroupNameOverrides: state.proxyGroupNameOverrides,
            experimentalCnUseCnRuleSet: state.experimentalCnUseCnRuleSet,
            cnIpNoResolve: state.cnIpNoResolve,
            ruleOrder: state.ruleOrder,
          }),
        };
      });
    },

    updateCustomProxyGroup: (id: string, group: Partial<CustomProxyGroup>) => {
      setAndGenerateConfig((state) => {
        const prevGroup = state.customProxyGroups.find((g) => g.id === id);
        const prevName = typeof prevGroup?.name === "string" ? prevGroup.name : "";
        const nextName = typeof group.name === "string" ? group.name : prevName;
        const nextCustomRules =
          prevName && nextName && prevName !== nextName
            ? state.customRules.map((rule) =>
                rule.target === prevName ? { ...rule, target: nextName } : rule,
              )
            : state.customRules;
        const nextCustomProxyGroups = state.customProxyGroups.map((g) =>
          g.id === id ? { ...g, ...group } : g,
        );
        return {
          customRules: nextCustomRules,
          customProxyGroups: nextCustomProxyGroups,
          ruleOrder: normalizePersistedRuleOrder({
            enabledModules: state.enabledProxyGroups,
            customRules: nextCustomRules,
            customProxyGroups: nextCustomProxyGroups,
            moduleRuleOverrides: state.moduleRuleOverrides,
            moduleRuleExclusions: state.moduleRuleExclusions,
            proxyGroupNameOverrides: state.proxyGroupNameOverrides,
            experimentalCnUseCnRuleSet: state.experimentalCnUseCnRuleSet,
            cnIpNoResolve: state.cnIpNoResolve,
            ruleOrder: state.ruleOrder,
          }),
        };
      });
    },
  };
}
