import type { ProxyGroupModule, ProxyGroupRule } from "./proxy-group-modules";

export type ModuleRuleExclusions = Record<string, string[]>;

export type EffectiveModuleRuleSource = "preset" | "custom";

export type EffectiveModuleRule = ProxyGroupRule & {
  source: EffectiveModuleRuleSource;
};

type RuleIdLike = { id?: unknown };
type RuleGroupLike = { rules?: RuleIdLike[] };

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeModuleRuleExclusions(value: unknown): ModuleRuleExclusions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const out: ModuleRuleExclusions = {};
  for (const [moduleIdRaw, ruleIdsRaw] of Object.entries(value as Record<string, unknown>)) {
    const moduleId = normalizeString(moduleIdRaw);
    if (!moduleId || !Array.isArray(ruleIdsRaw)) continue;

    const ids: string[] = [];
    const seen = new Set<string>();
    for (const item of ruleIdsRaw) {
      const id = normalizeString(item);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
    if (ids.length > 0) out[moduleId] = ids;
  }

  return out;
}

export function getExcludedModuleRuleIds(
  moduleId: string,
  exclusions?: ModuleRuleExclusions
): Set<string> {
  const id = normalizeString(moduleId);
  if (!id) return new Set();
  return new Set((exclusions?.[id] || []).map(normalizeString).filter(Boolean));
}

export function getModuleRuleOrderKey(moduleId: string, ruleId: string): string {
  return `module:${moduleId}:${ruleId}`;
}

export function isPresetModuleRule(module: ProxyGroupModule, ruleId: string): boolean {
  const id = normalizeString(ruleId);
  if (!id) return false;
  return module.rules.some((rule) => rule.id === id);
}

export function isModuleRuleMovedFrom(
  moduleId: string,
  ruleId: string,
  overrides?: Record<string, RuleIdLike[]>,
  customRuleGroups?: RuleGroupLike[]
): boolean {
  const sourceId = normalizeString(moduleId);
  const id = normalizeString(ruleId);
  if (!sourceId || !id) return false;

  for (const [targetModuleIdRaw, rules] of Object.entries(overrides || {})) {
    const targetModuleId = normalizeString(targetModuleIdRaw);
    if (!targetModuleId || targetModuleId === sourceId || !Array.isArray(rules)) continue;
    if (rules.some((rule) => normalizeString(rule?.id) === id)) return true;
  }

  for (const group of customRuleGroups || []) {
    if (!Array.isArray(group?.rules)) continue;
    if (group.rules.some((rule) => normalizeString(rule?.id) === id)) return true;
  }

  return false;
}

export function getModuleRuleById(
  module: ProxyGroupModule,
  ruleId: string,
  overrides?: Record<string, ProxyGroupRule[]>
): ProxyGroupRule | null {
  const id = normalizeString(ruleId);
  if (!id) return null;

  const preset = module.rules.find((rule) => rule.id === id);
  if (preset) return preset;

  const extra = Array.isArray(overrides?.[module.id]) ? overrides?.[module.id] || [] : [];
  return extra.find((rule) => rule.id === id) || null;
}

export function getEffectiveModuleRuleItems(
  module: ProxyGroupModule,
  overrides?: Record<string, ProxyGroupRule[]>,
  exclusions?: ModuleRuleExclusions
): EffectiveModuleRule[] {
  const excluded = getExcludedModuleRuleIds(module.id, exclusions);
  const seen = new Set<string>();
  const out: EffectiveModuleRule[] = [];

  for (const rule of module.rules) {
    if (!rule?.id || excluded.has(rule.id) || seen.has(rule.id)) continue;
    seen.add(rule.id);
    out.push({ ...rule, source: "preset" });
  }

  const extraRules = Array.isArray(overrides?.[module.id]) ? overrides?.[module.id] || [] : [];
  for (const rule of extraRules) {
    if (!rule?.id || seen.has(rule.id)) continue;
    seen.add(rule.id);
    out.push({ ...rule, source: "custom" });
  }

  return out;
}

export function getEffectiveModuleRules(
  module: ProxyGroupModule,
  overrides?: Record<string, ProxyGroupRule[]>,
  exclusions?: ModuleRuleExclusions
): ProxyGroupRule[] {
  return getEffectiveModuleRuleItems(module, overrides, exclusions).map(({ source: _source, ...rule }) => rule);
}
