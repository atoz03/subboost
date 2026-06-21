import type { BuiltinRuleEdits, CustomProxyGroup, CustomRule, CustomRuleSet, TemplateType } from "./config";
import type { FilteredProxyGroup } from "./filtered-proxy-group";

// 中转代理组（使用 dialer-proxy 语法）
export interface DialerProxyGroup {
  id: string;
  enabled?: boolean; // 默认启用；停用后不会写入配置
  name: string; // 组名，如 "美国中转"
  relayNodes: string[]; // 用于中转的节点名称列表
  type: "select" | "url-test"; // 组类型
  targetNodes: string[]; // 使用此中转的落地节点名称列表
}

export type SubBoostTemplateConfig = {
  schema?: "subboost-template-config/v1";
  template: TemplateType;
  enabledProxyGroups: string[];
  hiddenProxyGroups?: string[];
  customProxyGroups: CustomProxyGroup[];
  filteredProxyGroups?: FilteredProxyGroup[];
  customRuleSets: CustomRuleSet[];
  builtinRuleEdits?: BuiltinRuleEdits;
  customRules: CustomRule[];
  ruleOrder?: string[];
  cnIpNoResolve?: boolean;
  experimentalCnUseCnRuleSet?: boolean;
  dialerProxyGroups: DialerProxyGroup[];
  proxyGroupNameOverrides?: Record<string, string>;
  dnsYaml: string;
  mixedPort: number;
  allowLan: boolean;
  testUrl: string;
  testInterval: number;
  ruleProviderBaseUrl: string;
};
