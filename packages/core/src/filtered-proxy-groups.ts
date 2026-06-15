import type { ParsedNode } from "@subboost/core/types/node";
import type { FilteredProxyGroup, NodeRegion } from "@subboost/core/types/filtered-proxy-group";

const SOURCE_IDS_KEY = "_sourceIds";

export const REGION_PRESETS: Array<{
  id: NodeRegion;
  label: string;
  emoji: string;
  keywords: string[];
}> = [
  { id: "us", label: "美国", emoji: "🇺🇸", keywords: ["美国", "US", "USA", "United States", "洛杉矶", "纽约", "西雅图"] },
  { id: "hk", label: "香港", emoji: "🇭🇰", keywords: ["香港", "HK", "Hong Kong", "港"] },
  { id: "jp", label: "日本", emoji: "🇯🇵", keywords: ["日本", "JP", "Japan", "东京", "大阪"] },
  { id: "sg", label: "新加坡", emoji: "🇸🇬", keywords: ["新加坡", "SG", "Singapore", "狮城"] },
  { id: "tw", label: "台湾", emoji: "🇹🇼", keywords: ["台湾", "TW", "Taiwan", "台北"] },
  { id: "kr", label: "韩国", emoji: "🇰🇷", keywords: ["韩国", "KR", "Korea", "首尔"] },
  { id: "uk", label: "英国", emoji: "🇬🇧", keywords: ["英国", "UK", "United Kingdom", "London", "伦敦"] },
  { id: "de", label: "德国", emoji: "🇩🇪", keywords: ["德国", "DE", "Germany", "Frankfurt", "法兰克福"] },
  { id: "fr", label: "法国", emoji: "🇫🇷", keywords: ["法国", "FR", "France", "Paris", "巴黎"] },
  { id: "ca", label: "加拿大", emoji: "🇨🇦", keywords: ["加拿大", "CA", "Canada", "Toronto", "多伦多"] },
  { id: "au", label: "澳大利亚", emoji: "🇦🇺", keywords: ["澳大利亚", "AU", "Australia", "Sydney", "悉尼"] },
  { id: "other", label: "其他", emoji: "🌐", keywords: [] },
];

function getNodeSourceIds(node: ParsedNode): string[] {
  const record = node as unknown as Record<string, unknown>;
  const raw = record[SOURCE_IDS_KEY];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is string => typeof s === "string" && Boolean(s.trim()))
    .map((s) => s.trim());
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileRegex(pattern?: string): RegExp | null {
  const raw = typeof pattern === "string" ? pattern.trim() : "";
  if (!raw) return null;
  try {
    return new RegExp(raw, "i");
  } catch {
    return null;
  }
}

function matchesRegion(nodeName: string, regions: NodeRegion[]): boolean {
  if (!Array.isArray(regions) || regions.length === 0) return true;
  const normalized = nodeName.toLowerCase();

  for (const region of regions) {
    if (region === "other") continue;
    const preset = REGION_PRESETS.find((p) => p.id === region);
    if (!preset) continue;
    if (preset.keywords.some((kw) => normalized.includes(kw.toLowerCase()))) return true;
  }

  // "other"：表示不命中任何已知地区
  if (regions.includes("other")) {
    for (const preset of REGION_PRESETS) {
      if (preset.id === "other") continue;
      if (preset.keywords.some((kw) => normalized.includes(kw.toLowerCase()))) return false;
    }
    return true;
  }

  return false;
}

export function getFilteredProxyGroupNodeNames(nodes: ParsedNode[], group: FilteredProxyGroup): string[] {
  if (!group || !group.enabled) return [];
  if (!Array.isArray(nodes) || nodes.length === 0) return [];

  const sourceIds = Array.isArray(group.sourceIds) ? group.sourceIds.filter((s) => typeof s === "string" && s.trim()) : [];
  const includeRe = compileRegex(group.includeRegex);
  const excludeRe = compileRegex(group.excludeRegex);
  const regions = Array.isArray(group.regions) ? group.regions : [];
  const excludedNodeNames = Array.isArray(group.excludedNodeNames)
    ? group.excludedNodeNames.filter((s): s is string => typeof s === "string" && Boolean(s.trim())).map((s) => s.trim())
    : [];

  const sourceIdSet = new Set<string>(sourceIds.map((s) => s.trim()));
  const excludedNameSet = new Set<string>(excludedNodeNames);

  const out: string[] = [];
  for (const node of nodes) {
    const name = (node?.name || "").toString().trim();
    if (!name) continue;

    if (sourceIdSet.size > 0) {
      const nodeSourceIds = getNodeSourceIds(node);
      const hasAny = nodeSourceIds.some((id) => sourceIdSet.has(id));
      if (!hasAny) continue;
    }

    if (!matchesRegion(name, regions as NodeRegion[])) continue;

    if (includeRe && !includeRe.test(name)) continue;
    if (excludeRe && excludeRe.test(name)) continue;
    if (excludedNameSet.has(name)) continue;

    out.push(name);
  }

  return out;
}

export function getFilteredProxyGroupProxies(nodes: ParsedNode[], group: FilteredProxyGroup): string[] {
  const names = getFilteredProxyGroupNodeNames(nodes, group);
  return ["DIRECT", "REJECT", ...names];
}
