import { PROXY_GROUP_MODULES } from "@subboost/core/generator/proxy-groups";
import { resolveProxyGroupModuleName } from "@subboost/core/proxy-group-name";
import { normalizeProxyGroupAdvancedConfig } from "@subboost/core/proxy-group-advanced";
import type { ProxyGroupAdvancedConfig } from "@subboost/core/types/config";

type MutableRecord = Record<string, unknown>;

const LEGACY_GROUP_TYPES = new Set([
  "select",
  "url-test",
  "fallback",
  "load-balance",
  "direct-first",
  "reject-first",
]);

function isRecord(value: unknown): value is MutableRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const text = stringValue(item);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function makeUniqueName(name: string, used: Set<string>): string {
  const base = name.trim() || "自定义代理组";
  if (!used.has(base)) {
    used.add(base);
    return base;
  }

  let index = 2;
  let candidate = `${base} (${index})`;
  while (used.has(candidate)) {
    index += 1;
    candidate = `${base} (${index})`;
  }
  used.add(candidate);
  return candidate;
}

function makeUniqueId(id: string, used: Set<string>): string {
  const base = `migrated-filtered-${id || "group"}`;
  if (!used.has(base)) {
    used.add(base);
    return base;
  }

  let index = 2;
  let candidate = `${base}-${index}`;
  while (used.has(candidate)) {
    index += 1;
    candidate = `${base}-${index}`;
  }
  used.add(candidate);
  return candidate;
}

function migrateAdvanced(group: MutableRecord): ProxyGroupAdvancedConfig {
  return normalizeProxyGroupAdvancedConfig({
    sourceIds: uniqueStringArray(group.sourceIds),
    regions: uniqueStringArray(group.regions),
    includeRegex: stringValue(group.includeRegex),
    excludeRegex: stringValue(group.excludeRegex),
    excludedMembers: uniqueStringArray(group.excludedNodeNames).map((name) => ({
      kind: "node" as const,
      name,
    })),
  });
}

function retargetValue(value: unknown, nameMap: Map<string, string>): unknown {
  const target = stringValue(value);
  return target && nameMap.has(target) ? nameMap.get(target) : value;
}

function retargetStringArray(value: unknown, nameMap: Map<string, string>): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((item) => (typeof item === "string" ? nameMap.get(item.trim()) ?? item : item));
}

function inferRuleSetBehavior(value: unknown, path: string): "domain" | "ipcidr" {
  return value === "ipcidr" || path.toLowerCase().startsWith("geoip/") ? "ipcidr" : "domain";
}

function normalizeRuleSetPath(value: unknown): string {
  const path = stringValue(value);
  const match = path.match(/(?:^|\/)(geosite|geoip)\/[^/?#\s]+\.mrs/i);
  return (match?.[0] ?? path).replace(/^\/+/, "").trim();
}

function isRuleSetPath(value: string): boolean {
  return /^(geosite|geoip)\/[^/?#\s]+\.mrs$/i.test(value) || /^https?:\/\//i.test(value);
}

function appendUniqueRuleSet(
  ruleSets: MutableRecord[],
  usedIds: Set<string>,
  ruleSet: MutableRecord
): { id: string; added: boolean } {
  const baseId = stringValue(ruleSet.id);
  if (!baseId) return { id: "", added: false };

  let id = baseId;
  let index = 2;
  while (usedIds.has(id)) {
    id = `${baseId}-${index}`;
    index += 1;
  }
  usedIds.add(id);
  ruleSets.push({ ...ruleSet, id });
  return { id, added: true };
}

function moduleTargetName(moduleId: string, nameOverrides: unknown): string {
  const proxyModule = PROXY_GROUP_MODULES.find((candidate) => candidate.id === moduleId);
  if (!proxyModule) return moduleId;
  const override = isRecord(nameOverrides) ? stringValue(nameOverrides[moduleId]) : "";
  return resolveProxyGroupModuleName(proxyModule, override || undefined);
}

function builtinRuleKey(moduleId: string, ruleId: string): string {
  return `module:${moduleId}:${ruleId}`;
}

function builtinRuleSourceKey(ruleId: string): string | null {
  for (const proxyModule of PROXY_GROUP_MODULES) {
    if (proxyModule.rules.some((rule) => rule.id === ruleId)) return builtinRuleKey(proxyModule.id, ruleId);
  }
  return null;
}

function remapRuleOrder(value: unknown, keyMap: Map<string, string>): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((item) => (typeof item === "string" ? keyMap.get(item) ?? item : item));
}

function hasLegacyCustomProxyGroupRules(value: unknown): boolean {
  return Array.isArray(value) && value.some((group) => isRecord(group) && Array.isArray(group.rules));
}

export function migrateFilteredProxyGroupsConfig<T>(config: T): T {
  if (
    !isRecord(config) ||
    (!Array.isArray(config.filteredProxyGroups) &&
      !isRecord(config.moduleRuleOverrides) &&
      !isRecord(config.moduleRuleExclusions) &&
      !hasLegacyCustomProxyGroupRules(config.customProxyGroups) &&
      !("allRulesOrderEditingEnabled" in config))
  ) {
    return config;
  }

  const next: MutableRecord = { ...config };
  const filteredProxyGroups = Array.isArray(config.filteredProxyGroups) ? config.filteredProxyGroups : [];
  const legacyGroupRuleSets: MutableRecord[] = [];
  const existingCustomGroups = Array.isArray(next.customProxyGroups)
    ? next.customProxyGroups.flatMap((group) => {
        if (!isRecord(group)) return [];
        const nextGroup = { ...group };
        const groupId = stringValue(group.id);
        const groupName = stringValue(group.name);
        if (Array.isArray(group.rules) && groupId && groupName) {
          for (const rawRule of group.rules) {
            if (!isRecord(rawRule)) continue;
            const id = stringValue(rawRule.id);
            const path = normalizeRuleSetPath(rawRule.url);
            if (!id || !path || !isRuleSetPath(path)) continue;
            legacyGroupRuleSets.push({
              id,
              name: stringValue(rawRule.name) || id,
              behavior: inferRuleSetBehavior(rawRule.behavior, path),
              path,
              target: groupName,
              ...(rawRule.noResolve === true || path.toLowerCase().startsWith("geoip/") ? { noResolve: true } : {}),
              __legacyOrderKey: `custom-group:${groupId}:${id}`,
            });
          }
        }
        delete nextGroup.rules;
        return [nextGroup];
      })
    : [];
  const usedIds = new Set(existingCustomGroups.map((group) => stringValue(group.id)).filter(Boolean));
  const usedNames = new Set(existingCustomGroups.map((group) => stringValue(group.name)).filter(Boolean));
  const nameMap = new Map<string, string>();
  const idMap = new Map<string, string>();
  const ruleOrderKeyMap = new Map<string, string>();
  const migratedGroups: MutableRecord[] = [];

  for (const rawGroup of filteredProxyGroups) {
    if (!isRecord(rawGroup)) continue;
    const oldId = stringValue(rawGroup.id);
    const oldName = stringValue(rawGroup.name);
    if (!oldId || !oldName) continue;

    const nextId = makeUniqueId(oldId, usedIds);
    const nextName = makeUniqueName(oldName, usedNames);
    idMap.set(oldId, nextId);
    nameMap.set(oldName, nextName);

    const rawGroupType = stringValue(rawGroup.groupType) || "select";
    const groupType = LEGACY_GROUP_TYPES.has(rawGroupType) ? rawGroupType : "select";
    migratedGroups.push({
      id: nextId,
      name: nextName,
      emoji: stringValue(rawGroup.emoji),
      ...(rawGroup.enabled === false ? { enabled: false } : {}),
      description: "从旧版筛选代理组迁移",
      memberSource: "filtered-nodes",
      includeInGroupMembers: true,
      groupType,
      ...(groupType === "load-balance" && stringValue(rawGroup.strategy)
        ? { strategy: stringValue(rawGroup.strategy) }
        : {}),
      advanced: migrateAdvanced(rawGroup),
    });
  }

  next.customProxyGroups = [...existingCustomGroups, ...migratedGroups];
  delete next.filteredProxyGroups;

  const existingRuleSets = Array.isArray(next.customRuleSets) ? next.customRuleSets.filter(isRecord) : [];
  const usedRuleSetIds = new Set(existingRuleSets.map((ruleSet) => stringValue(ruleSet.id)).filter(Boolean));
  const migratedRuleSets = [...existingRuleSets];
  for (const legacyRuleSet of legacyGroupRuleSets) {
    const legacyOrderKey = stringValue(legacyRuleSet.__legacyOrderKey);
    delete legacyRuleSet.__legacyOrderKey;
    const appended = appendUniqueRuleSet(migratedRuleSets, usedRuleSetIds, legacyRuleSet);
    if (appended.added && legacyOrderKey) ruleOrderKeyMap.set(legacyOrderKey, `custom-rule-set:${appended.id}`);
  }

  const legacyOverrides = isRecord(config.moduleRuleOverrides) ? config.moduleRuleOverrides : {};
  const legacyExclusions = isRecord(config.moduleRuleExclusions) ? config.moduleRuleExclusions : {};
  const overridesByTarget = new Map<string, MutableRecord[]>();
  for (const [rawTargetId, rawRules] of Object.entries(legacyOverrides)) {
    const targetId = rawTargetId.trim();
    if (!targetId || !Array.isArray(rawRules)) continue;
    const rules: MutableRecord[] = [];
    for (const rawRule of rawRules) {
      if (!isRecord(rawRule)) continue;
      const id = stringValue(rawRule.id);
      const path = normalizeRuleSetPath(rawRule.path);
      if (!id || !path || !isRuleSetPath(path)) continue;
      rules.push({
        id,
        name: stringValue(rawRule.name) || id,
        behavior: inferRuleSetBehavior(rawRule.behavior, path),
        path,
        ...(rawRule.noResolve === true || path.toLowerCase().startsWith("geoip/") ? { noResolve: true } : {}),
      });
    }
    if (rules.length > 0) overridesByTarget.set(targetId, rules);
  }

  const existingBuiltinEdits = isRecord(next.builtinRuleEdits) ? { ...next.builtinRuleEdits } : {};
  const consumedOverrides = new Set<string>();
  for (const [rawSourceId, rawRuleIds] of Object.entries(legacyExclusions)) {
    const sourceId = rawSourceId.trim();
    if (!sourceId || !Array.isArray(rawRuleIds)) continue;
    for (const rawRuleId of rawRuleIds) {
      const ruleId = stringValue(rawRuleId);
      if (!ruleId) continue;
      const key = builtinRuleKey(sourceId, ruleId);
      if (key in existingBuiltinEdits) continue;
      let movedTarget: string | null = null;
      let movedTargetId: string | null = null;
      for (const [targetId, rules] of overridesByTarget) {
        const index = rules.findIndex((rule) => stringValue(rule.id) === ruleId);
        if (index < 0 || !PROXY_GROUP_MODULES.some((module) => module.id === targetId)) continue;
        movedTarget = moduleTargetName(targetId, config.proxyGroupNameOverrides);
        movedTargetId = targetId;
        consumedOverrides.add(`${targetId}:${index}`);
        break;
      }
      existingBuiltinEdits[key] = movedTarget ? { target: movedTarget } : { enabled: false };
      if (movedTargetId) ruleOrderKeyMap.set(builtinRuleKey(movedTargetId, ruleId), key);
    }
  }

  for (const [targetId, rules] of overridesByTarget) {
    const target = moduleTargetName(targetId, config.proxyGroupNameOverrides);
    rules.forEach((rule, index) => {
      if (consumedOverrides.has(`${targetId}:${index}`)) return;
      const ruleId = stringValue(rule.id);
      if (builtinRuleSourceKey(ruleId) === builtinRuleKey(targetId, ruleId)) return;
      const appended = appendUniqueRuleSet(migratedRuleSets, usedRuleSetIds, { ...rule, target });
      if (appended.added) ruleOrderKeyMap.set(builtinRuleKey(targetId, ruleId), `custom-rule-set:${appended.id}`);
    });
  }

  next.customRuleSets = migratedRuleSets;
  next.builtinRuleEdits = existingBuiltinEdits;
  delete next.moduleRuleOverrides;
  delete next.moduleRuleExclusions;
  delete next.allRulesOrderEditingEnabled;

  if (Array.isArray(next.customRules)) {
    next.customRules = next.customRules.map((rule) => {
      if (!isRecord(rule) || !("target" in rule)) return rule;
      return { ...rule, target: retargetValue(rule.target, nameMap) };
    });
  }

  if (Array.isArray(next.customRuleSets)) {
    next.customRuleSets = next.customRuleSets.map((ruleSet) => {
      if (!isRecord(ruleSet) || !("target" in ruleSet)) return ruleSet;
      return { ...ruleSet, target: retargetValue(ruleSet.target, nameMap) };
    });
  }

  if (isRecord(next.builtinRuleEdits)) {
    next.builtinRuleEdits = Object.fromEntries(
      Object.entries(next.builtinRuleEdits).map(([key, edit]) => {
        if (!isRecord(edit)) return [key, edit];
        return [key, "target" in edit ? { ...edit, target: retargetValue(edit.target, nameMap) } : edit];
      })
    );
  }

  if (Array.isArray(next.dialerProxyGroups)) {
    next.dialerProxyGroups = next.dialerProxyGroups.map((group) => {
      if (!isRecord(group) || !("relayNodes" in group)) return group;
      return { ...group, relayNodes: retargetStringArray(group.relayNodes, nameMap) };
    });
  }

  if (Array.isArray(next.proxyGroupOrder)) {
    next.proxyGroupOrder = next.proxyGroupOrder.map((key) => {
      const text = stringValue(key);
      if (!text.startsWith("filtered:")) return key;
      const nextId = idMap.get(text.slice("filtered:".length));
      return nextId ? `custom:${nextId}` : key;
    });
  }

  next.ruleOrder = remapRuleOrder(next.ruleOrder, ruleOrderKeyMap);

  return next as T;
}
