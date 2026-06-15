import { expect } from "vitest";
import { getModulesForTemplate } from "@subboost/core/generator/proxy-groups";
import {
  SUBBOOST_TEMPLATE_CONFIG_SCHEMA,
  validateSubBoostTemplateConfig,
} from "@subboost/core/templates/config-template";
import type { SubBoostTemplateConfig } from "@subboost/core/types/template-config";

export function validConfig(patch: Partial<SubBoostTemplateConfig> = {}): SubBoostTemplateConfig {
  return {
    schema: SUBBOOST_TEMPLATE_CONFIG_SCHEMA,
    template: "minimal",
    enabledProxyGroups: getModulesForTemplate("minimal"),
    hiddenProxyGroups: [],
    customProxyGroups: [],
    filteredProxyGroups: [],
    moduleRuleOverrides: {},
    moduleRuleExclusions: {},
    customRules: [],
    ruleOrder: [],
    dialerProxyGroups: [],
    proxyGroupNameOverrides: {},
    dnsYaml: "",
    mixedPort: 7897,
    allowLan: true,
    testUrl: "https://www.gstatic.com/generate_204",
    testInterval: 300,
    ruleProviderBaseUrl: "https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/meta/geo",
    cnIpNoResolve: true,
    experimentalCnUseCnRuleSet: true,
    ...patch,
  };
}

export function expectInvalid(patch: Partial<SubBoostTemplateConfig>, error: string) {
  expect(validateSubBoostTemplateConfig(validConfig(patch))).toEqual({ ok: false, error });
}
