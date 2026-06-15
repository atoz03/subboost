import { PROXY_GROUP_MODULES } from "@subboost/core/generator/proxy-groups";
import { resolveProxyGroupModuleName } from "@subboost/core/proxy-group-name";
import type { CustomProxyGroup } from "@subboost/core/types/config";
import type { ModuleRuleOverride } from "@subboost/core/types/template-config";

export type CustomRoutingRuleSetTarget = {
  kind: "module" | "custom";
  id: string;
  name: string;
  value: string;
};

export type CustomRoutingRuleSetItem = {
  key: string;
  source: {
    kind: "module" | "custom";
    id: string;
  };
  id: string;
  name: string;
  behavior: "domain" | "ipcidr";
  path: string;
  target: CustomRoutingRuleSetTarget;
  noResolve?: boolean;
};

export function getRuleSetTargetValue(target: {
  kind: "module" | "custom";
  id: string;
}): string {
  return `${target.kind}:${target.id}`;
}

export function parseRuleSetTargetValue(
  value: string,
): { kind: "module" | "custom"; id: string } | null {
  const trimmed = value.trim();
  if (trimmed.startsWith("module:")) {
    const id = trimmed.slice("module:".length).trim();
    return id ? { kind: "module", id } : null;
  }
  if (trimmed.startsWith("custom:")) {
    const id = trimmed.slice("custom:".length).trim();
    return id ? { kind: "custom", id } : null;
  }
  return null;
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

export function buildRuleSetUrlFromPath(path: string, baseUrl: string): string {
  const normalizedPath = normalizeRuleSetPathInput(path);
  if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath;
  return `${baseUrl.replace(/\/+$/, "")}/${normalizedPath}`;
}

export function collectCustomRoutingRuleSets({
  customProxyGroups,
  moduleRuleOverrides,
  proxyGroupNameOverrides,
}: {
  customProxyGroups: CustomProxyGroup[];
  moduleRuleOverrides: Record<string, ModuleRuleOverride[]>;
  proxyGroupNameOverrides?: Record<string, string>;
}): CustomRoutingRuleSetItem[] {
  const items: CustomRoutingRuleSetItem[] = [];

  for (const proxyModule of PROXY_GROUP_MODULES) {
    const targetName = resolveProxyGroupModuleName(
      proxyModule,
      proxyGroupNameOverrides?.[proxyModule.id],
    );
    const target = {
      kind: "module" as const,
      id: proxyModule.id,
      name: targetName,
      value: getRuleSetTargetValue({ kind: "module", id: proxyModule.id }),
    };

    for (const rule of moduleRuleOverrides?.[proxyModule.id] || []) {
      if (!rule || !rule.id || !rule.path) continue;
      items.push({
        key: `module:${proxyModule.id}:${rule.id}`,
        source: { kind: "module", id: proxyModule.id },
        id: rule.id,
        name: rule.name || rule.id,
        behavior: rule.behavior,
        path: normalizeRuleSetPathInput(rule.path),
        target,
        noResolve: Boolean(rule.noResolve),
      });
    }
  }

  for (const group of customProxyGroups) {
    if (!group || !group.id) continue;
    const target = {
      kind: "custom" as const,
      id: group.id,
      name: group.name,
      value: getRuleSetTargetValue({ kind: "custom", id: group.id }),
    };

    for (const rule of group.rules || []) {
      if (!rule || !rule.id || !rule.url) continue;
      items.push({
        key: `custom:${group.id}:${rule.id}`,
        source: { kind: "custom", id: group.id },
        id: rule.id,
        name: rule.name || rule.id,
        behavior: rule.behavior,
        path: extractRuleSetPathFromUrl(rule.url),
        target,
        noResolve: Boolean(rule.noResolve),
      });
    }
  }

  return items;
}
