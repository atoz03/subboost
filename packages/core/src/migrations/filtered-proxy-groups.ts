import { normalizeProxyGroupAdvancedConfig } from "@subboost/core/proxy-group-advanced";
import type { ProxyGroupAdvancedConfig } from "@subboost/core/types/config";

type MutableRecord = Record<string, unknown>;
const LEGACY_GROUP_TYPES = new Set(["select", "url-test", "fallback", "load-balance", "direct-first", "reject-first"]);

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

export function migrateFilteredProxyGroupsConfig<T>(config: T): T {
  if (!isRecord(config)) {
    return config;
  }
  const record = config;
  const filteredProxyGroups = record.filteredProxyGroups;
  if (!Array.isArray(filteredProxyGroups) || filteredProxyGroups.length === 0) {
    return config;
  }

  const next: MutableRecord = { ...record };
  const existingCustomGroups = Array.isArray(next.customProxyGroups)
    ? next.customProxyGroups.filter(isRecord)
    : [];
  const usedIds = new Set(existingCustomGroups.map((group) => stringValue(group.id)).filter(Boolean));
  const usedNames = new Set(existingCustomGroups.map((group) => stringValue(group.name)).filter(Boolean));
  const nameMap = new Map<string, string>();
  const idMap = new Map<string, string>();
  const migratedGroups: MutableRecord[] = [];

  for (const rawGroup of filteredProxyGroups) {
    if (!isRecord(rawGroup)) continue;
    if (rawGroup.enabled === false) continue;
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
      description: "自定义代理组",
      groupType,
      ...(groupType === "load-balance" && stringValue(rawGroup.strategy)
        ? { strategy: stringValue(rawGroup.strategy) }
        : {}),
      advanced: migrateAdvanced(rawGroup),
    });
  }

  next.customProxyGroups = [...existingCustomGroups, ...migratedGroups];
  delete next.filteredProxyGroups;

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
        const nextEdit = { ...edit };
        if ("target" in edit) nextEdit.target = retargetValue(edit.target, nameMap);
        return [key, nextEdit];
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
      const id = text.slice("filtered:".length);
      const nextId = idMap.get(id);
      return nextId ? `custom:${nextId}` : key;
    });
  }

  return next as T;
}
