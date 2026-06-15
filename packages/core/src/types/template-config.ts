import type { ModuleRuleExclusions } from "../generator/module-rules";
import type { CustomProxyGroup, CustomRule, TemplateType } from "./config";
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

/**
 * 给“内置代理组（模块）”附加的规则集（Rule Provider）。
 * 用于把规则库搜索到的规则直接挂到任意内置代理组上。
 */
export interface ModuleRuleOverride {
  id: string;
  name: string;
  behavior: "domain" | "ipcidr";
  path: string;
  noResolve?: boolean;
}

export type SubBoostTemplateConfig = {
  schema?: "subboost-template-config/v1";
  template: TemplateType;
  enabledProxyGroups: string[];
  hiddenProxyGroups?: string[];
  customProxyGroups: CustomProxyGroup[];
  filteredProxyGroups?: FilteredProxyGroup[];
  moduleRuleOverrides?: Record<string, ModuleRuleOverride[]>;
  moduleRuleExclusions?: ModuleRuleExclusions;
  customRules: CustomRule[];
  ruleOrder?: string[];
  allRulesOrderEditingEnabled?: boolean;
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
