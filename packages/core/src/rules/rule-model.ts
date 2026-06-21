import { PROXY_GROUP_MODULES } from "@subboost/core/generator/proxy-group-modules";
import { getModuleRuleOrderKey, normalizeModuleRuleExclusions } from "@subboost/core/generator/module-rules";
import { resolveProxyGroupModuleName } from "@subboost/core/proxy-group-name";
import type {
  BuiltinRuleEdit,
  BuiltinRuleEdits,
  CustomProxyGroup,
  CustomRuleSet,
  RuleSetBehavior,
} from "@subboost/core/types/config";
import { DEFAULT_LOAD_BALANCE_STRATEGY, isLoadBalanceStrategy } from "@subboost/core/types/config";

export const RULE_SET_PATH_RE = /^(geosite|geoip)\/[^/?#\s]+\.mrs$/i;

type LegacyModuleRuleOverride = {
  id: string;
  name: string;
  behavior: RuleSetBehavior;
  path: string;
  noResolve?: boolean;
};

type LegacyCustomProxyGroupRule = {
  id: string;
  name: string;
  behavior: RuleSetBehavior;
  url: string;
  noResolve?: boolean;
};

export type NormalizedRuleModel = {
  customProxyGroups: CustomProxyGroup[];
  customRuleSets: CustomRuleSet[];
  builtinRuleEdits: BuiltinRuleEdits;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBehavior(value: unknown, path: string): RuleSetBehavior {
  return value === "ipcidr" || path.toLowerCase().startsWith("geoip/") ? "ipcidr" : "domain";
}

export function extractRuleSetPathFromUrl(url: string): string {
  const trimmed = url.trim();
  const match = trimmed.match(/(?:^|\/)(geosite|geoip)\/[^/?#\s]+\.mrs/i);
  if (!match) return trimmed;
  return match[0].replace(/^\/+/, "");
}

export function normalizeRuleSetPathInput(input: string): string {
  return extractRuleSetPathFromUrl(input).replace(/^\/+/, "").trim();
}

export function isValidRuleSetPathOrUrl(value: string): boolean {
  return RULE_SET_PATH_RE.test(value) || /^https?:\/\//i.test(value);
}

export function buildRuleSetUrlFromPath(path: string, baseUrl: string): string {
  const normalizedPath = normalizeRuleSetPathInput(path);
  if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath;
  return `${baseUrl.replace(/\/+$/, "")}/${normalizedPath}`;
}

function normalizeCustomRuleSet(item: unknown): CustomRuleSet | null {
  if (!isRecord(item)) return null;
  const id = toTrimmedString(item.id);
  const rawPath = toTrimmedString(item.path);
  const path = normalizeRuleSetPathInput(rawPath);
  const target = toTrimmedString(item.target);
  if (!id || !path || !target || !isValidRuleSetPathOrUrl(path)) return null;
  const behavior = normalizeBehavior(item.behavior, path);
  const name = toTrimmedString(item.name) || id;
  const noResolve = typeof item.noResolve === "boolean" ? item.noResolve : behavior === "ipcidr";
  return {
    id,
    name,
    behavior,
    path,
    target,
    ...(noResolve ? { noResolve: true } : {}),
  };
}

function normalizeBuiltinRuleEdit(item: unknown): BuiltinRuleEdit | null {
  if (!isRecord(item)) return null;
  const target = toTrimmedString(item.target);
  const enabled = item.enabled === false ? false : undefined;
  if (!target && enabled !== false) return null;
  return {
    ...(target ? { target } : {}),
    ...(enabled === false ? { enabled: false } : {}),
  };
}

export function normalizeBuiltinRuleEdits(value: unknown): BuiltinRuleEdits {
  if (!isRecord(value)) return {};
  const out: BuiltinRuleEdits = {};
  for (const [rawKey, rawEdit] of Object.entries(value)) {
    const key = rawKey.trim();
    if (!key) continue;
    const edit = normalizeBuiltinRuleEdit(rawEdit);
    if (!edit) continue;
    out[key] = edit;
  }
  return out;
}

function addUniqueCustomRuleSet(items: CustomRuleSet[], item: CustomRuleSet): void {
  const existing = new Set(items.map((ruleSet) => ruleSet.id));
  if (!existing.has(item.id)) {
    items.push(item);
    return;
  }

  let index = 2;
  let id = `${item.id}-${index}`;
  while (existing.has(id)) {
    index += 1;
    id = `${item.id}-${index}`;
  }
  items.push({ ...item, id });
}

function normalizeLegacyModuleRuleOverrides(value: unknown): Record<string, LegacyModuleRuleOverride[]> {
  if (!isRecord(value)) return {};
  const out: Record<string, LegacyModuleRuleOverride[]> = {};
  for (const [rawModuleId, rawRules] of Object.entries(value)) {
    const moduleId = rawModuleId.trim();
    if (!moduleId || !Array.isArray(rawRules)) continue;
    const rules: LegacyModuleRuleOverride[] = [];
    for (const rawRule of rawRules) {
      if (!isRecord(rawRule)) continue;
      const id = toTrimmedString(rawRule.id);
      const path = normalizeRuleSetPathInput(toTrimmedString(rawRule.path));
      if (!id || !path || !isValidRuleSetPathOrUrl(path)) continue;
      const behavior = normalizeBehavior(rawRule.behavior, path);
      const name = toTrimmedString(rawRule.name) || id;
      const noResolve = typeof rawRule.noResolve === "boolean" ? rawRule.noResolve : behavior === "ipcidr";
      rules.push({ id, name, behavior, path, ...(noResolve ? { noResolve: true } : {}) });
    }
    if (rules.length > 0) out[moduleId] = rules;
  }
  return out;
}

function normalizeLegacyCustomProxyGroupRules(value: unknown): LegacyCustomProxyGroupRule[] {
  if (!Array.isArray(value)) return [];
  const out: LegacyCustomProxyGroupRule[] = [];
  for (const rawRule of value) {
    if (!isRecord(rawRule)) continue;
    const id = toTrimmedString(rawRule.id);
    const url = toTrimmedString(rawRule.url);
    if (!id || !url) continue;
    const path = normalizeRuleSetPathInput(url);
    if (!isValidRuleSetPathOrUrl(path)) continue;
    const behavior = normalizeBehavior(rawRule.behavior, path);
    const name = toTrimmedString(rawRule.name) || id;
    const noResolve = typeof rawRule.noResolve === "boolean" ? rawRule.noResolve : behavior === "ipcidr";
    out.push({ id, name, behavior, url, ...(noResolve ? { noResolve: true } : {}) });
  }
  return out;
}

function getBuiltinRuleSourceKey(ruleId: string): string | null {
  for (const proxyModule of PROXY_GROUP_MODULES) {
    if (proxyModule.rules.some((rule) => rule.id === ruleId)) {
      return getModuleRuleOrderKey(proxyModule.id, ruleId);
    }
  }
  return null;
}

function normalizeCustomProxyGroupsAndLegacyRules(value: unknown): {
  groups: CustomProxyGroup[];
  legacyRuleSets: CustomRuleSet[];
} {
  if (!Array.isArray(value)) return { groups: [], legacyRuleSets: [] };
  const groups: CustomProxyGroup[] = [];
  const legacyRuleSets: CustomRuleSet[] = [];

  for (const rawGroup of value) {
    if (!isRecord(rawGroup)) continue;
    const id = toTrimmedString(rawGroup.id);
    const name = toTrimmedString(rawGroup.name);
    const emoji = toTrimmedString(rawGroup.emoji);
    const groupType = toTrimmedString(rawGroup.groupType);
    if (!id || !name) continue;
    if (
      groupType !== "select" &&
      groupType !== "url-test" &&
      groupType !== "fallback" &&
      groupType !== "load-balance" &&
      groupType !== "direct-first" &&
      groupType !== "reject-first"
    ) {
      continue;
    }

    groups.push({
      id,
      name,
      emoji,
      groupType,
      ...(groupType === "load-balance"
        ? {
            strategy: isLoadBalanceStrategy(rawGroup.strategy)
              ? rawGroup.strategy
              : DEFAULT_LOAD_BALANCE_STRATEGY,
          }
        : {}),
    });

    for (const rule of normalizeLegacyCustomProxyGroupRules(rawGroup.rules)) {
      addUniqueCustomRuleSet(legacyRuleSets, {
        id: rule.id,
        name: rule.name,
        behavior: rule.behavior,
        path: normalizeRuleSetPathInput(rule.url),
        target: name,
        ...(rule.noResolve ? { noResolve: true } : {}),
      });
    }
  }

  return { groups, legacyRuleSets };
}

export function normalizeRuleModelFromConfig(value: unknown): NormalizedRuleModel {
  const record = isRecord(value) ? value : {};
  const { groups: customProxyGroups, legacyRuleSets } = normalizeCustomProxyGroupsAndLegacyRules(record.customProxyGroups);
  const customRuleSets: CustomRuleSet[] = [];
  const builtinRuleEdits: BuiltinRuleEdits = normalizeBuiltinRuleEdits(record.builtinRuleEdits);

  if (Array.isArray(record.customRuleSets)) {
    for (const rawRuleSet of record.customRuleSets) {
      const normalized = normalizeCustomRuleSet(rawRuleSet);
      if (normalized) addUniqueCustomRuleSet(customRuleSets, normalized);
    }
  }

  for (const ruleSet of legacyRuleSets) {
    addUniqueCustomRuleSet(customRuleSets, ruleSet);
  }

  const legacyOverrides = normalizeLegacyModuleRuleOverrides(record.moduleRuleOverrides);
  const legacyExclusions = normalizeModuleRuleExclusions(record.moduleRuleExclusions);
  const consumedMovedOverrideKeys = new Set<string>();

  for (const [sourceModuleId, ruleIds] of Object.entries(legacyExclusions)) {
    for (const ruleId of ruleIds) {
      const key = getModuleRuleOrderKey(sourceModuleId, ruleId);
      let movedTarget: string | null = null;
      for (const [targetModuleId, rules] of Object.entries(legacyOverrides)) {
        const index = rules.findIndex((rule) => rule.id === ruleId);
        if (index < 0) continue;
        const targetModule = PROXY_GROUP_MODULES.find((module) => module.id === targetModuleId);
        if (!targetModule) continue;
        movedTarget = resolveProxyGroupModuleName(targetModule, (record.proxyGroupNameOverrides as Record<string, string> | undefined)?.[targetModuleId]);
        consumedMovedOverrideKeys.add(`${targetModuleId}:${index}`);
        break;
      }
      builtinRuleEdits[key] = {
        ...(movedTarget ? { target: movedTarget } : {}),
        ...(movedTarget ? {} : { enabled: false as const }),
      };
    }
  }

  for (const [targetModuleId, rules] of Object.entries(legacyOverrides)) {
    const targetModule = PROXY_GROUP_MODULES.find((module) => module.id === targetModuleId);
    const target = targetModule
      ? resolveProxyGroupModuleName(targetModule, (record.proxyGroupNameOverrides as Record<string, string> | undefined)?.[targetModuleId])
      : targetModuleId;
    rules.forEach((rule, index) => {
      if (consumedMovedOverrideKeys.has(`${targetModuleId}:${index}`)) return;
      const builtinSourceKey = getBuiltinRuleSourceKey(rule.id);
      if (builtinSourceKey && builtinSourceKey === getModuleRuleOrderKey(targetModuleId, rule.id)) return;
      addUniqueCustomRuleSet(customRuleSets, {
        id: rule.id,
        name: rule.name,
        behavior: rule.behavior,
        path: rule.path,
        target,
        ...(rule.noResolve ? { noResolve: true } : {}),
      });
    });
  }

  return { customProxyGroups, customRuleSets, builtinRuleEdits };
}
