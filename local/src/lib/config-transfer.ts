import { validateSubBoostTemplateConfig } from "@subboost/core/templates/config-template";
import type { ParsedNode } from "@subboost/core/types/node";
import type { SubBoostTemplateConfig } from "@subboost/core/types/template-config";
import type { ConfigState, SubscriptionSource } from "@subboost/ui/store/config-store";

export type ConfigTransferWorkspace = Pick<
  ConfigState,
  | "nodes"
  | "deletedNodeNames"
  | "deletedNodes"
  | "parseErrors"
  | "sources"
  | "proxyGroupOrder"
  | "listenerPorts"
  | "moduleRuleEditWarningAccepted"
>;

export type ConfigTransferDocument = {
  schema: "subboost-config-transfer/v2";
  exportedAt: string;
  app: "subboost-local";
  config: SubBoostTemplateConfig;
  workspace: ConfigTransferWorkspace;
};

export type ParsedConfigTransfer = {
  config: SubBoostTemplateConfig;
  workspace?: ConfigTransferWorkspace;
};

export function buildConfigTransferDocument(state: ConfigState): ConfigTransferDocument {
  return {
    schema: "subboost-config-transfer/v2",
    exportedAt: new Date().toISOString(),
    app: "subboost-local",
    config: {
      schema: "subboost-template-config/v1",
      template: state.template,
      enabledProxyGroups: state.enabledProxyGroups,
      hiddenProxyGroups: state.hiddenProxyGroups,
      customProxyGroups: state.customProxyGroups,
      proxyGroupAdvanced: state.proxyGroupAdvanced,
      proxyGroupAdvancedModeEnabled: state.proxyGroupAdvancedModeEnabled,
      customRuleSets: state.customRuleSets,
      builtinRuleEdits: state.builtinRuleEdits,
      customRules: state.customRules,
      ruleOrder: state.ruleOrder,
      dialerProxyGroups: state.dialerProxyGroups,
      proxyGroupNameOverrides: state.proxyGroupNameOverrides,
      dnsYaml: state.dnsYaml,
      mixedPort: state.mixedPort,
      allowLan: state.allowLan,
      testUrl: state.testUrl,
      testInterval: state.testInterval,
      ruleProviderBaseUrl: state.ruleProviderBaseUrl,
      cnIpNoResolve: state.cnIpNoResolve,
      experimentalCnUseCnRuleSet: state.experimentalCnUseCnRuleSet,
    },
    workspace: {
      nodes: state.nodes,
      deletedNodeNames: state.deletedNodeNames,
      deletedNodes: state.deletedNodes,
      parseErrors: state.parseErrors,
      sources: state.sources,
      proxyGroupOrder: state.proxyGroupOrder,
      listenerPorts: state.listenerPorts,
      moduleRuleEditWarningAccepted: state.moduleRuleEditWarningAccepted,
    },
  };
}

export function parseConfigTransferDocument(value: unknown): ParsedConfigTransfer {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("配置文件格式无效。");
  }

  const record = value as Record<string, unknown>;
  const isTransferDocument =
    record.schema === "subboost-config-transfer/v1" || record.schema === "subboost-config-transfer/v2";
  const config = isTransferDocument ? record.config : value;
  const validated = validateSubBoostTemplateConfig(config);
  if (!validated.ok) throw new Error(validated.error);

  if (record.schema !== "subboost-config-transfer/v2") return { config: validated.config };
  return { config: validated.config, workspace: parseWorkspace(record.workspace) };
}

function parseWorkspace(value: unknown): ConfigTransferWorkspace {
  if (!isRecord(value)) throw new Error("完整备份缺少工作区数据。");

  return {
    nodes: parseNodes(value.nodes, "nodes"),
    deletedNodeNames: parseStringArray(value.deletedNodeNames, "deletedNodeNames"),
    deletedNodes: parseDeletedNodes(value.deletedNodes),
    parseErrors: parseStringArray(value.parseErrors, "parseErrors"),
    sources: parseSources(value.sources),
    proxyGroupOrder: parseStringArray(value.proxyGroupOrder, "proxyGroupOrder"),
    listenerPorts: parseListenerPorts(value.listenerPorts),
    moduleRuleEditWarningAccepted:
      typeof value.moduleRuleEditWarningAccepted === "boolean" ? value.moduleRuleEditWarningAccepted : false,
  };
}

function parseNodes(value: unknown, field: string): ParsedNode[] {
  if (!Array.isArray(value)) throw new Error(`${field} 必须是节点数组。`);
  return value.map((node, index) => {
    if (!isRecord(node) || typeof node.name !== "string" || typeof node.type !== "string") {
      throw new Error(`${field}[${index}] 不是有效节点。`);
    }
    return node as ParsedNode;
  });
}

function parseDeletedNodes(value: unknown): ConfigTransferWorkspace["deletedNodes"] {
  if (!Array.isArray(value)) throw new Error("deletedNodes 必须是数组。");
  return value.map((item, index) => {
    if (!isRecord(item) || typeof item.originName !== "string" || typeof item.name !== "string") {
      throw new Error(`deletedNodes[${index}] 无效。`);
    }
    if (item.node !== undefined) parseNodes([item.node], `deletedNodes[${index}].node`);
    if (item.listenerPort !== undefined && !isPort(item.listenerPort)) {
      throw new Error(`deletedNodes[${index}].listenerPort 无效。`);
    }
    if (item.dialerRelayGroupIds !== undefined) {
      parseStringArray(item.dialerRelayGroupIds, `deletedNodes[${index}].dialerRelayGroupIds`);
    }
    if (item.dialerTargetGroupIds !== undefined) {
      parseStringArray(item.dialerTargetGroupIds, `deletedNodes[${index}].dialerTargetGroupIds`);
    }
    return item as ConfigTransferWorkspace["deletedNodes"][number];
  });
}

function parseSources(value: unknown): SubscriptionSource[] {
  if (!Array.isArray(value)) throw new Error("sources 必须是导入源数组。");
  return value.map((source, index) => {
    if (
      !isRecord(source) ||
      typeof source.id !== "string" ||
      typeof source.content !== "string" ||
      !["url", "yaml", "nodes"].includes(source.type as string)
    ) {
      throw new Error(`sources[${index}] 无效。`);
    }
    return source as unknown as SubscriptionSource;
  });
}

function parseListenerPorts(value: unknown): Record<string, number> {
  if (!isRecord(value)) throw new Error("listenerPorts 必须是对象。");
  const ports: Record<string, number> = {};
  for (const [name, port] of Object.entries(value)) {
    if (!name || !isPort(port)) throw new Error("listenerPorts 包含无效端口。");
    ports[name] = port;
  }
  return ports;
}

function parseStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${field} 必须是字符串数组。`);
  }
  return value;
}

function isPort(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 65535;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
