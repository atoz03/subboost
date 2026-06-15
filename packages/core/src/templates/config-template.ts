import { PROXY_GROUP_MODULES } from "@subboost/core/generator/proxy-groups";
import { normalizeModuleRuleExclusions, type ModuleRuleExclusions } from "@subboost/core/generator/module-rules";
import { normalizePersistedRuleOrder } from "@subboost/core/generator/rules";
import { ensureCustomRuleId, isCustomRuleType } from "@subboost/core/rules/custom-rule-utils";
import {
  DEFAULT_LOAD_BALANCE_STRATEGY,
  isLoadBalanceStrategy,
  type CustomProxyGroup,
  type CustomRule,
  type LoadBalanceStrategy,
  type TemplateType,
} from "@subboost/core/types/config";
import type { FilteredProxyGroup, FilteredProxyGroupType, NodeRegion } from "@subboost/core/types/filtered-proxy-group";
import type { DialerProxyGroup, ModuleRuleOverride, SubBoostTemplateConfig } from "@subboost/core/types/template-config";

export const SUBBOOST_TEMPLATE_CONFIG_SCHEMA = "subboost-template-config/v1";

type ValidationResult =
  | { ok: true; config: SubBoostTemplateConfig }
  | { ok: false; error: string };

const BUILTIN_MODULE_IDS = new Set(PROXY_GROUP_MODULES.map((module) => module.id));
const RULE_PATH_RE = /^(geosite|geoip)\/[^/]+\.mrs$/i;
const FILTERED_GROUP_TYPES = new Set<FilteredProxyGroupType>([
  "select",
  "url-test",
  "fallback",
  "load-balance",
  "direct-first",
  "reject-first",
]);
const NODE_REGIONS = new Set<NodeRegion>(["us", "hk", "jp", "sg", "tw", "kr", "uk", "de", "fr", "ca", "au", "other"]);

export function validateSubBoostTemplateConfig(value: unknown): ValidationResult {
  if (!isRecord(value)) return invalid("模板配置必须是对象");
  if (value.schema !== SUBBOOST_TEMPLATE_CONFIG_SCHEMA) {
    return invalid("模板配置 schema 无效");
  }

  const template = parseTemplateType(value.template);
  if (!template) return invalid("模板类型无效");

  const enabledProxyGroups = parseModuleIdArray(value.enabledProxyGroups, "enabledProxyGroups", { required: true });
  if (!enabledProxyGroups.ok) return enabledProxyGroups;
  if (enabledProxyGroups.value.length === 0) return invalid("至少需要一个代理组");

  const hiddenProxyGroups = parseModuleIdArray(value.hiddenProxyGroups, "hiddenProxyGroups", { required: false });
  if (!hiddenProxyGroups.ok) return hiddenProxyGroups;
  const hiddenSet = new Set(hiddenProxyGroups.value);
  if (enabledProxyGroups.value.every((id) => hiddenSet.has(id))) {
    return invalid("至少需要一个可见代理组");
  }

  const customProxyGroups = parseCustomProxyGroups(value.customProxyGroups);
  if (!customProxyGroups.ok) return customProxyGroups;
  const filteredProxyGroups = parseFilteredProxyGroups(value.filteredProxyGroups);
  if (!filteredProxyGroups.ok) return filteredProxyGroups;
  const customRules = parseCustomRules(value.customRules);
  if (!customRules.ok) return customRules;
  const dialerProxyGroups = parseDialerProxyGroups(value.dialerProxyGroups);
  if (!dialerProxyGroups.ok) return dialerProxyGroups;
  const moduleRuleOverrides = parseModuleRuleOverrides(value.moduleRuleOverrides);
  if (!moduleRuleOverrides.ok) return moduleRuleOverrides;
  const moduleRuleExclusions = parseModuleRuleExclusions(value.moduleRuleExclusions);
  if (!moduleRuleExclusions.ok) return moduleRuleExclusions;
  const proxyGroupNameOverrides = parseStringRecord(value.proxyGroupNameOverrides, "proxyGroupNameOverrides");
  if (!proxyGroupNameOverrides.ok) return proxyGroupNameOverrides;
  const ruleOrder = parseOptionalStringArray(value.ruleOrder, "ruleOrder");
  if (!ruleOrder.ok) return ruleOrder;

  const dnsYaml = parseRequiredString(value.dnsYaml, "dnsYaml", { allowEmpty: true });
  if (!dnsYaml.ok) return dnsYaml;
  const mixedPort = parsePort(value.mixedPort, "mixedPort");
  if (!mixedPort.ok) return mixedPort;
  const allowLan = parseBoolean(value.allowLan, "allowLan");
  if (!allowLan.ok) return allowLan;
  const testUrl = parseHttpUrlString(value.testUrl, "testUrl");
  if (!testUrl.ok) return testUrl;
  const testInterval = parsePositiveInteger(value.testInterval, "testInterval");
  if (!testInterval.ok) return testInterval;
  const ruleProviderBaseUrl = parseHttpUrlString(value.ruleProviderBaseUrl, "ruleProviderBaseUrl");
  if (!ruleProviderBaseUrl.ok) return ruleProviderBaseUrl;
  const allRulesOrderEditingEnabled = parseOptionalBoolean(value.allRulesOrderEditingEnabled, "allRulesOrderEditingEnabled");
  if (!allRulesOrderEditingEnabled.ok) return allRulesOrderEditingEnabled;
  const cnIpNoResolve = parseOptionalBoolean(value.cnIpNoResolve, "cnIpNoResolve");
  if (!cnIpNoResolve.ok) return cnIpNoResolve;
  const experimentalCnUseCnRuleSet = parseOptionalBoolean(
    value.experimentalCnUseCnRuleSet,
    "experimentalCnUseCnRuleSet"
  );
  if (!experimentalCnUseCnRuleSet.ok) return experimentalCnUseCnRuleSet;

  const normalizedRuleOrder = normalizePersistedRuleOrder({
    enabledModules: enabledProxyGroups.value.filter((id) => !hiddenSet.has(id)),
    customRules: customRules.value,
    customProxyGroups: customProxyGroups.value,
    moduleRuleOverrides: moduleRuleOverrides.value,
    moduleRuleExclusions: moduleRuleExclusions.value,
    proxyGroupNameOverrides: proxyGroupNameOverrides.value,
    experimentalCnUseCnRuleSet: experimentalCnUseCnRuleSet.value,
    cnIpNoResolve: cnIpNoResolve.value,
    ruleOrder: ruleOrder.value,
  });

  return {
    ok: true,
    config: {
      schema: SUBBOOST_TEMPLATE_CONFIG_SCHEMA,
      template,
      enabledProxyGroups: enabledProxyGroups.value,
      hiddenProxyGroups: hiddenProxyGroups.value,
      customProxyGroups: customProxyGroups.value,
      filteredProxyGroups: filteredProxyGroups.value,
      moduleRuleOverrides: moduleRuleOverrides.value,
      moduleRuleExclusions: moduleRuleExclusions.value,
      customRules: customRules.value,
      ruleOrder: normalizedRuleOrder,
      ...(allRulesOrderEditingEnabled.value !== undefined
        ? { allRulesOrderEditingEnabled: allRulesOrderEditingEnabled.value }
        : {}),
      ...(cnIpNoResolve.value !== undefined ? { cnIpNoResolve: cnIpNoResolve.value } : {}),
      ...(experimentalCnUseCnRuleSet.value !== undefined
        ? { experimentalCnUseCnRuleSet: experimentalCnUseCnRuleSet.value }
        : {}),
      dialerProxyGroups: dialerProxyGroups.value,
      proxyGroupNameOverrides: proxyGroupNameOverrides.value,
      dnsYaml: dnsYaml.value,
      mixedPort: mixedPort.value,
      allowLan: allowLan.value,
      testUrl: testUrl.value,
      testInterval: testInterval.value,
      ruleProviderBaseUrl: ruleProviderBaseUrl.value,
    },
  };
}

function invalid(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseTemplateType(value: unknown): TemplateType | null {
  if (value === "minimal" || value === "standard" || value === "full") return value;
  return null;
}

function parseRequiredString(
  value: unknown,
  field: string,
  opts: { allowEmpty?: boolean } = {}
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== "string") return invalid(`${field} 必须是字符串`);
  const trimmed = value.trim();
  if (!opts.allowEmpty && !trimmed) return invalid(`${field} 不能为空`);
  return { ok: true, value: opts.allowEmpty ? value : trimmed };
}

function parseBoolean(value: unknown, field: string): { ok: true; value: boolean } | { ok: false; error: string } {
  if (typeof value !== "boolean") return invalid(`${field} 必须是布尔值`);
  return { ok: true, value };
}

function parseOptionalBoolean(
  value: unknown,
  field: string
): { ok: true; value?: boolean } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value !== "boolean") return invalid(`${field} 必须是布尔值`);
  return { ok: true, value };
}

function parsePositiveInteger(
  value: unknown,
  field: string
): { ok: true; value: number } | { ok: false; error: string } {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return invalid(`${field} 必须是正整数`);
  }
  return { ok: true, value };
}

function parsePort(value: unknown, field: string): { ok: true; value: number } | { ok: false; error: string } {
  const parsed = parsePositiveInteger(value, field);
  if (!parsed.ok) return parsed;
  if (parsed.value > 65535) return invalid(`${field} 必须在 1 到 65535 之间`);
  return parsed;
}

function parseHttpUrlString(
  value: unknown,
  field: string
): { ok: true; value: string } | { ok: false; error: string } {
  const parsed = parseRequiredString(value, field);
  if (!parsed.ok) return parsed;
  if (!/^https?:\/\//i.test(parsed.value)) return invalid(`${field} 必须是 http(s) URL`);
  return parsed;
}

function parseOptionalStringArray(
  value: unknown,
  field: string
): { ok: true; value?: string[] } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: undefined };
  const parsed = parseStringArray(value, field);
  if (!parsed.ok) return parsed;
  return { ok: true, value: parsed.value };
}

function parseStringArray(value: unknown, field: string): { ok: true; value: string[] } | { ok: false; error: string } {
  if (!Array.isArray(value)) return invalid(`${field} 必须是数组`);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") return invalid(`${field} 只能包含字符串`);
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return { ok: true, value: out };
}

function parseModuleIdArray(
  value: unknown,
  field: string,
  opts: { required: boolean }
): { ok: true; value: string[] } | { ok: false; error: string } {
  if (value === undefined && !opts.required) return { ok: true, value: [] };
  const parsed = parseStringArray(value, field);
  if (!parsed.ok) return parsed;
  for (const id of parsed.value) {
    if (!BUILTIN_MODULE_IDS.has(id)) return invalid(`${field} 包含未知代理组`);
  }
  return parsed;
}

function parseStringRecord(
  value: unknown,
  field: string
): { ok: true; value: Record<string, string> } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: {} };
  if (!isRecord(value)) return invalid(`${field} 必须是对象`);
  const out: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (typeof rawValue !== "string") return invalid(`${field} 的值必须是字符串`);
    const trimmedKey = key.trim();
    const trimmedValue = rawValue.trim();
    if (trimmedKey && trimmedValue) out[trimmedKey] = trimmedValue;
  }
  return { ok: true, value: out };
}

function parseCustomRules(value: unknown): { ok: true; value: CustomRule[] } | { ok: false; error: string } {
  if (!Array.isArray(value)) return invalid("customRules 必须是数组");
  const out: CustomRule[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!isRecord(item)) return invalid("customRules 只能包含对象");
    if (typeof item.type !== "string" || !isCustomRuleType(item.type)) return invalid("customRules 包含无效类型");
    const ruleValue = parseRequiredString(item.value, "customRules.value");
    if (!ruleValue.ok) return ruleValue;
    const target = parseRequiredString(item.target, "customRules.target");
    if (!target.ok) return target;
    const noResolve = parseOptionalBoolean(item.noResolve, "customRules.noResolve");
    if (!noResolve.ok) return noResolve;
    out.push(
      ensureCustomRuleId(
        {
          id: typeof item.id === "string" ? item.id : undefined,
          type: item.type,
          value: ruleValue.value,
          target: target.value,
          ...(noResolve.value !== undefined ? { noResolve: noResolve.value } : {}),
        },
        index
      )
    );
  }
  return { ok: true, value: out };
}

function parseCustomProxyGroups(value: unknown): { ok: true; value: CustomProxyGroup[] } | { ok: false; error: string } {
  if (!Array.isArray(value)) return invalid("customProxyGroups 必须是数组");
  const out: CustomProxyGroup[] = [];
  for (const item of value) {
    if (!isRecord(item)) return invalid("customProxyGroups 只能包含对象");
    const id = parseRequiredString(item.id, "customProxyGroups.id");
    if (!id.ok) return id;
    const name = parseRequiredString(item.name, "customProxyGroups.name");
    if (!name.ok) return name;
    const emoji = parseRequiredString(item.emoji, "customProxyGroups.emoji", { allowEmpty: true });
    if (!emoji.ok) return emoji;
    const groupType = parseFilteredGroupType(item.groupType, "customProxyGroups.groupType");
    if (!groupType.ok) return groupType;
    const rules = parseCustomProxyGroupRules(item.rules);
    if (!rules.ok) return rules;
    const strategy = parseOptionalLoadBalanceStrategy(item.strategy, "customProxyGroups.strategy");
    if (!strategy.ok) return strategy;
    out.push({
      id: id.value,
      name: name.value,
      emoji: emoji.value,
      groupType: groupType.value,
      ...(groupType.value === "load-balance"
        ? { strategy: strategy.value ?? DEFAULT_LOAD_BALANCE_STRATEGY }
        : {}),
      rules: rules.value,
    });
  }
  return { ok: true, value: out };
}

function parseCustomProxyGroupRules(
  value: unknown
): { ok: true; value: CustomProxyGroup["rules"] } | { ok: false; error: string } {
  if (!Array.isArray(value)) return invalid("customProxyGroups.rules 必须是数组");
  const out: CustomProxyGroup["rules"] = [];
  for (const item of value) {
    if (!isRecord(item)) return invalid("customProxyGroups.rules 只能包含对象");
    const id = parseRequiredString(item.id, "customProxyGroups.rules.id");
    if (!id.ok) return id;
    const name = parseRequiredString(item.name, "customProxyGroups.rules.name");
    if (!name.ok) return name;
    const behavior = parseRuleBehavior(item.behavior, "customProxyGroups.rules.behavior");
    if (!behavior.ok) return behavior;
    const url = parseHttpUrlString(item.url, "customProxyGroups.rules.url");
    if (!url.ok) return url;
    const noResolve = parseOptionalBoolean(item.noResolve, "customProxyGroups.rules.noResolve");
    if (!noResolve.ok) return noResolve;
    out.push({
      id: id.value,
      name: name.value,
      behavior: behavior.value,
      url: url.value,
      ...(noResolve.value !== undefined ? { noResolve: noResolve.value } : {}),
    });
  }
  return { ok: true, value: out };
}

function parseFilteredProxyGroups(value: unknown): { ok: true; value: FilteredProxyGroup[] } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: [] };
  if (!Array.isArray(value)) return invalid("filteredProxyGroups 必须是数组");
  const out: FilteredProxyGroup[] = [];
  for (const item of value) {
    if (!isRecord(item)) return invalid("filteredProxyGroups 只能包含对象");
    const id = parseRequiredString(item.id, "filteredProxyGroups.id");
    if (!id.ok) return id;
    const name = parseRequiredString(item.name, "filteredProxyGroups.name");
    if (!name.ok) return name;
    const enabled = parseBoolean(item.enabled, "filteredProxyGroups.enabled");
    if (!enabled.ok) return enabled;
    const groupType = parseFilteredGroupType(item.groupType ?? "select", "filteredProxyGroups.groupType");
    if (!groupType.ok) return groupType;
    const sourceIds = parseStringArray(item.sourceIds ?? [], "filteredProxyGroups.sourceIds");
    if (!sourceIds.ok) return sourceIds;
    const regions = parseNodeRegions(item.regions ?? []);
    if (!regions.ok) return regions;
    const excludedNodeNames = parseStringArray(item.excludedNodeNames ?? [], "filteredProxyGroups.excludedNodeNames");
    if (!excludedNodeNames.ok) return excludedNodeNames;
    const strategy = parseOptionalLoadBalanceStrategy(item.strategy, "filteredProxyGroups.strategy");
    if (!strategy.ok) return strategy;
    out.push({
      id: id.value,
      name: name.value,
      enabled: enabled.value,
      groupType: groupType.value,
      ...(groupType.value === "load-balance"
        ? { strategy: strategy.value ?? DEFAULT_LOAD_BALANCE_STRATEGY }
        : {}),
      sourceIds: sourceIds.value,
      regions: regions.value,
      excludedNodeNames: excludedNodeNames.value,
      ...(typeof item.includeRegex === "string" && item.includeRegex.trim()
        ? { includeRegex: item.includeRegex.trim() }
        : {}),
      ...(typeof item.excludeRegex === "string" && item.excludeRegex.trim()
        ? { excludeRegex: item.excludeRegex.trim() }
        : {}),
      ...(typeof item.emoji === "string" ? { emoji: item.emoji.trim() } : {}),
    });
  }
  return { ok: true, value: out };
}

function parseDialerProxyGroups(value: unknown): { ok: true; value: DialerProxyGroup[] } | { ok: false; error: string } {
  if (!Array.isArray(value)) return invalid("dialerProxyGroups 必须是数组");
  const out: DialerProxyGroup[] = [];
  for (const item of value) {
    if (!isRecord(item)) return invalid("dialerProxyGroups 只能包含对象");
    const id = parseRequiredString(item.id, "dialerProxyGroups.id");
    if (!id.ok) return id;
    const name = parseRequiredString(item.name, "dialerProxyGroups.name");
    if (!name.ok) return name;
    if (item.type !== "select" && item.type !== "url-test") return invalid("dialerProxyGroups.type 无效");
    const relayNodes = parseStringArray(item.relayNodes, "dialerProxyGroups.relayNodes");
    if (!relayNodes.ok) return relayNodes;
    const targetNodes = parseStringArray(item.targetNodes, "dialerProxyGroups.targetNodes");
    if (!targetNodes.ok) return targetNodes;
    const enabled = parseOptionalBoolean(item.enabled, "dialerProxyGroups.enabled");
    if (!enabled.ok) return enabled;
    out.push({
      id: id.value,
      name: name.value,
      type: item.type,
      relayNodes: relayNodes.value,
      targetNodes: targetNodes.value,
      ...(enabled.value !== undefined ? { enabled: enabled.value } : {}),
    });
  }
  return { ok: true, value: out };
}

function parseModuleRuleOverrides(
  value: unknown
): { ok: true; value: Record<string, ModuleRuleOverride[]> } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: {} };
  if (!isRecord(value)) return invalid("moduleRuleOverrides 必须是对象");
  const out: Record<string, ModuleRuleOverride[]> = {};
  for (const [moduleId, rawRules] of Object.entries(value)) {
    if (!BUILTIN_MODULE_IDS.has(moduleId)) return invalid("moduleRuleOverrides 包含未知代理组");
    if (!Array.isArray(rawRules)) return invalid("moduleRuleOverrides 的值必须是数组");
    const rules: ModuleRuleOverride[] = [];
    for (const item of rawRules) {
      if (!isRecord(item)) return invalid("moduleRuleOverrides 只能包含对象");
      const id = parseRequiredString(item.id, "moduleRuleOverrides.id");
      if (!id.ok) return id;
      const name = parseRequiredString(item.name, "moduleRuleOverrides.name");
      if (!name.ok) return name;
      const behavior = parseRuleBehavior(item.behavior, "moduleRuleOverrides.behavior");
      if (!behavior.ok) return behavior;
      const path = parseRequiredString(item.path, "moduleRuleOverrides.path");
      if (!path.ok) return path;
      if (!RULE_PATH_RE.test(path.value)) return invalid("moduleRuleOverrides.path 无效");
      const noResolve = parseOptionalBoolean(item.noResolve, "moduleRuleOverrides.noResolve");
      if (!noResolve.ok) return noResolve;
      rules.push({
        id: id.value,
        name: name.value,
        behavior: behavior.value,
        path: path.value,
        ...(noResolve.value !== undefined ? { noResolve: noResolve.value } : {}),
      });
    }
    out[moduleId] = rules;
  }
  return { ok: true, value: out };
}

function parseModuleRuleExclusions(
  value: unknown
): { ok: true; value: ModuleRuleExclusions } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: {} };
  if (!isRecord(value)) return invalid("moduleRuleExclusions 必须是对象");
  for (const [moduleId, ruleIds] of Object.entries(value)) {
    if (!BUILTIN_MODULE_IDS.has(moduleId)) return invalid("moduleRuleExclusions 包含未知代理组");
    const parsed = parseStringArray(ruleIds, "moduleRuleExclusions");
    if (!parsed.ok) return parsed;
  }
  return { ok: true, value: normalizeModuleRuleExclusions(value) };
}

function parseRuleBehavior(
  value: unknown,
  field: string
): { ok: true; value: "domain" | "ipcidr" } | { ok: false; error: string } {
  if (value === "domain" || value === "ipcidr") return { ok: true, value };
  return invalid(`${field} 无效`);
}

function parseFilteredGroupType(
  value: unknown,
  field: string
): { ok: true; value: FilteredProxyGroupType } | { ok: false; error: string } {
  if (typeof value === "string" && FILTERED_GROUP_TYPES.has(value as FilteredProxyGroupType)) {
    return { ok: true, value: value as FilteredProxyGroupType };
  }
  return invalid(`${field} 无效`);
}

function parseOptionalLoadBalanceStrategy(
  value: unknown,
  field: string
): { ok: true; value?: LoadBalanceStrategy } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: undefined };
  if (!isLoadBalanceStrategy(value)) return invalid(`${field} 无效`);
  return { ok: true, value };
}

function parseNodeRegions(value: unknown): { ok: true; value: NodeRegion[] } | { ok: false; error: string } {
  const parsed = parseStringArray(value, "filteredProxyGroups.regions");
  if (!parsed.ok) return parsed;
  const out: NodeRegion[] = [];
  for (const region of parsed.value) {
    const key = region.toLowerCase();
    if (!NODE_REGIONS.has(key as NodeRegion)) return invalid("filteredProxyGroups.regions 包含未知地区");
    out.push(key as NodeRegion);
  }
  return { ok: true, value: out };
}
