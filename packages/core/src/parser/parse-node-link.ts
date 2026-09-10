import { parseNodeLinksByRegistry, normalizeNodeLinkScheme } from "./link-parsers";
import { canonicalizeParsedNode } from "./canonical-fields";
import type { ParsedNode } from "@subboost/core/types/node";

/**
 * 检测是否为裸代理格式（无协议前缀）
 */
export function isNakedProxyFormat(input: string): boolean {
  if (/^[^:@]+:\d+(?:\[[^\]]*\])?(?:\{[^}]*\})?$/.test(input) && input.includes(":")) return true;
  if (/^[^:@]+:\d+:[^:@]+:.+$/.test(input)) return true;
  if (/^[^:@]+:[^@]+@[^:@]+:\d+(?:\[[^\]]*\])?(?:\{[^}]*\})?$/.test(input)) return true;
  return false;
}

/**
 * 解析单个节点链接
 */
export function parseNodeLink(link: string): ParsedNode | null {
  return parseNodeLinks(link)[0] ?? null;
}

/** 解析单条分享链接；可表示多个绑定的协议会返回多个节点。 */
export function parseNodeLinks(link: string): ParsedNode[] {
  const trimmedLink = link.trim();
  if (!trimmedLink) return [];

  const normalizedLink = normalizeNodeLinkScheme(trimmedLink);
  const parsed = parseNodeLinksByRegistry(normalizedLink);
  if (parsed.length > 0) return parsed.map((node) => canonicalizeParsedNode(node));

  if (isNakedProxyFormat(normalizedLink)) {
    throw new Error("无法识别的代理格式，请添加协议前缀 (如 socks5://, http://)");
  }

  const schemeMatch = normalizedLink.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//);
  if (schemeMatch) {
    throw new Error(`不支持的协议: ${schemeMatch[1].toLowerCase()}`);
  }

  return [];
}
