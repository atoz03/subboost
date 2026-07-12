import { getBuiltinTemplateId } from "@subboost/core/templates/builtin";
import { TEMPLATES } from "@subboost/core/templates";
import { ensureCustomRulesHaveIds } from "@subboost/core/rules/custom-rule-utils";
import { normalizePersistedRuleOrder } from "@subboost/core/generator/rules";
import { PROXY_GROUP_MODULES } from "@subboost/core/generator/proxy-groups";
import { normalizeRuleModelFromConfig } from "@subboost/core/rules/rule-model";
import { migrateFilteredProxyGroupsConfig } from "@subboost/core/migrations/filtered-proxy-groups";
import { resolveProxyGroupAdvancedModeEnabled } from "@subboost/core/proxy-group-advanced-mode";
import type { ConfigActions, SubBoostTemplateConfig } from "../definitions";
import type { GetState, SetAndGenerateConfig, SetState } from "../store-types";

type TemplateActions = Pick<
  ConfigActions,
  | "setTemplate"
  | "setAppliedTemplateId"
  | "setEnabledProxyGroups"
  | "toggleProxyGroup"
  | "applyTemplateConfig"
  | "importTemplateConfig"
>;

function normalizeHiddenProxyGroups(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const builtinIds = new Set(PROXY_GROUP_MODULES.map((module) => module.id));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!id || !builtinIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function createTemplateActions(
  set: SetState,
  _get: GetState,
  setAndGenerateConfig: SetAndGenerateConfig
): TemplateActions {
  return {
    setTemplate: (template) => {
      const templateConfig = TEMPLATES[template];
      setAndGenerateConfig(() => ({
        template,
        enabledProxyGroups: templateConfig.groups,
        hiddenProxyGroups: [],
        appliedTemplateId: getBuiltinTemplateId(template),
        customRules: [],
        customRuleSets: [],
        builtinRuleEdits: {},
        ruleOrder: [],
        moduleRuleEditWarningAccepted: false,
      }));
    },

    setAppliedTemplateId: (templateId) => {
      set({ appliedTemplateId: templateId });
    },

    setEnabledProxyGroups: (groups) => {
      setAndGenerateConfig(() => ({ enabledProxyGroups: groups }));
    },

    toggleProxyGroup: (groupId) => {
      setAndGenerateConfig((state) => {
        const isEnabled = state.enabledProxyGroups.includes(groupId);
        const groups = isEnabled
          ? state.enabledProxyGroups.filter((g) => g !== groupId)
          : [...state.enabledProxyGroups, groupId];
        return {
          enabledProxyGroups: groups,
          hiddenProxyGroups: isEnabled
            ? state.hiddenProxyGroups
            : state.hiddenProxyGroups.filter((id) => id !== groupId),
        };
      });
    },

    // 应用模板配置（从模板库应用）
    applyTemplateConfig: (config: SubBoostTemplateConfig) => {
      if (!config || typeof config !== "object") return;
      const migratedConfig = migrateFilteredProxyGroupsConfig(config);

      setAndGenerateConfig((state) => {
        const ruleModel = normalizeRuleModelFromConfig(migratedConfig);
        const hasCustomProxyGroups = Array.isArray(migratedConfig.customProxyGroups);
        const hasCustomRuleSets = Array.isArray(migratedConfig.customRuleSets);
        const hasBuiltinRuleEdits = Boolean(migratedConfig.builtinRuleEdits && typeof migratedConfig.builtinRuleEdits === "object");
        const nextCustomProxyGroups =
          hasCustomProxyGroups || ruleModel.customProxyGroups.length > 0
            ? ruleModel.customProxyGroups
            : state.customProxyGroups;
        const nextCustomRuleSets =
          hasCustomRuleSets
            ? ruleModel.customRuleSets
            : state.customRuleSets;
        const nextBuiltinRuleEdits =
          hasBuiltinRuleEdits ? ruleModel.builtinRuleEdits : state.builtinRuleEdits;
        const nextCustomRules = Array.isArray(migratedConfig.customRules)
          ? ensureCustomRulesHaveIds(migratedConfig.customRules)
          : state.customRules;
        const nextProxyGroupAdvanced =
          migratedConfig.proxyGroupAdvanced && typeof migratedConfig.proxyGroupAdvanced === "object"
            ? migratedConfig.proxyGroupAdvanced
            : state.proxyGroupAdvanced;
        const nextHiddenProxyGroups = normalizeHiddenProxyGroups(migratedConfig.hiddenProxyGroups);
        const nextHiddenProxyGroupSet = new Set(nextHiddenProxyGroups);
        const shouldRefreshRuleOrder =
          Array.isArray(migratedConfig.ruleOrder) ||
          Array.isArray(migratedConfig.customRules) ||
          hasCustomProxyGroups ||
          hasCustomRuleSets ||
          hasBuiltinRuleEdits;
        const nextEnabledModulesRaw = Array.isArray(migratedConfig.enabledProxyGroups)
          ? migratedConfig.enabledProxyGroups
          : state.enabledProxyGroups;
        const nextEnabledModules = nextEnabledModulesRaw.filter(
          (moduleId) => !nextHiddenProxyGroupSet.has(moduleId)
        );
        const nextRuleOrder = shouldRefreshRuleOrder
          ? normalizePersistedRuleOrder({
              enabledModules: nextEnabledModules,
              customRules: nextCustomRules,
              customRuleSets: nextCustomRuleSets,
              customProxyGroups: nextCustomProxyGroups,
              builtinRuleEdits: nextBuiltinRuleEdits,
              proxyGroupNameOverrides:
                migratedConfig.proxyGroupNameOverrides && typeof migratedConfig.proxyGroupNameOverrides === "object"
                  ? (migratedConfig.proxyGroupNameOverrides as Record<string, string>)
                  : state.proxyGroupNameOverrides,
              experimentalCnUseCnRuleSet:
                typeof migratedConfig.experimentalCnUseCnRuleSet === "boolean"
                  ? migratedConfig.experimentalCnUseCnRuleSet
                  : state.experimentalCnUseCnRuleSet,
              cnIpNoResolve:
                typeof migratedConfig.cnIpNoResolve === "boolean" ? migratedConfig.cnIpNoResolve : state.cnIpNoResolve,
              ruleOrder: migratedConfig.ruleOrder,
            })
          : state.ruleOrder;
        return {
          // 不触碰 nodes/sources：模板只描述“生成策略”，节点仍由用户导入
          template: migratedConfig.template ?? state.template,
          enabledProxyGroups: nextEnabledModules,
          hiddenProxyGroups: nextHiddenProxyGroups,
          customProxyGroups: nextCustomProxyGroups,
          proxyGroupAdvanced: nextProxyGroupAdvanced,
          proxyGroupAdvancedModeEnabled: resolveProxyGroupAdvancedModeEnabled({
            proxyGroupAdvancedModeEnabled: migratedConfig.proxyGroupAdvancedModeEnabled,
            customProxyGroups: nextCustomProxyGroups,
            proxyGroupAdvanced: nextProxyGroupAdvanced,
          }),
          customRuleSets: nextCustomRuleSets,
          builtinRuleEdits: nextBuiltinRuleEdits,
          moduleRuleEditWarningAccepted: false,
          customRules: nextCustomRules,
          ruleOrder: nextRuleOrder,
          cnIpNoResolve:
            typeof migratedConfig.cnIpNoResolve === "boolean" ? migratedConfig.cnIpNoResolve : state.cnIpNoResolve,
          experimentalCnUseCnRuleSet:
            typeof migratedConfig.experimentalCnUseCnRuleSet === "boolean"
              ? migratedConfig.experimentalCnUseCnRuleSet
              : state.experimentalCnUseCnRuleSet,
          dialerProxyGroups: Array.isArray(migratedConfig.dialerProxyGroups)
            ? migratedConfig.dialerProxyGroups
            : state.dialerProxyGroups,
          proxyGroupNameOverrides:
            migratedConfig.proxyGroupNameOverrides && typeof migratedConfig.proxyGroupNameOverrides === "object"
              ? (migratedConfig.proxyGroupNameOverrides as Record<string, string>)
              : state.proxyGroupNameOverrides,
          dnsYaml: typeof migratedConfig.dnsYaml === "string" ? migratedConfig.dnsYaml : state.dnsYaml,
          mixedPort: typeof migratedConfig.mixedPort === "number" ? migratedConfig.mixedPort : state.mixedPort,
          allowLan: typeof migratedConfig.allowLan === "boolean" ? migratedConfig.allowLan : state.allowLan,
          testUrl: typeof migratedConfig.testUrl === "string" ? migratedConfig.testUrl : state.testUrl,
          testInterval:
            typeof migratedConfig.testInterval === "number" ? migratedConfig.testInterval : state.testInterval,
          ruleProviderBaseUrl:
            typeof migratedConfig.ruleProviderBaseUrl === "string"
              ? migratedConfig.ruleProviderBaseUrl
              : state.ruleProviderBaseUrl,
        };
      });
    },

    // 导入配置文件时复用同一套应用逻辑
    importTemplateConfig: (config: SubBoostTemplateConfig) => {
      if (!config || typeof config !== "object") return;
      const state = _get();
      state.applyTemplateConfig(config);
      set({ appliedTemplateId: null });
    },
  };
}
