import type { ParsedNode } from "@subboost/core/types/node";

function isLegacyMieruRangeNode(node: unknown): node is Record<string, unknown> {
  if (!node || typeof node !== "object" || Array.isArray(node)) return false;
  const record = node as Record<string, unknown>;
  const portRange = record["port-range"];
  return (
    record.type === "mieru" &&
    record.port !== undefined &&
    typeof portRange === "string" &&
    Boolean(portRange.trim())
  );
}

/**
 * 旧版本把 Mieru 端口范围的起点同时写入 port，仅在生成 YAML 时再删除。
 * 现在的端点模型要求 port 与 port-range 二选一，否则保存校验和生成都会拒绝该节点，
 * 因此读取已保存节点时先去掉多余的 port。
 */
export function migrateLegacyMieruNodes<T>(nodes: T): T {
  if (!Array.isArray(nodes) || !nodes.some(isLegacyMieruRangeNode)) return nodes;
  return nodes.map((node) => {
    if (!isLegacyMieruRangeNode(node)) return node;
    const { port: _legacyPort, ...rest } = node;
    return rest as ParsedNode;
  }) as T;
}
