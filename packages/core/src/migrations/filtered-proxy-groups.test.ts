import { describe, expect, it } from "vitest";
import { migrateFilteredProxyGroupsConfig } from "./filtered-proxy-groups";

describe("filtered proxy group config migration", () => {
  it("moves legacy filtered groups into the advanced custom group model", () => {
    const original = {
      customProxyGroups: [{ id: "existing", name: "Fast", emoji: "", groupType: "select" }],
      filteredProxyGroups: [
        {
          id: "fast",
          name: "Fast",
          emoji: "F",
          enabled: true,
          groupType: "load-balance",
          strategy: "round-robin",
          sourceIds: ["airport", "airport", ""],
          regions: ["us", "hk"],
          includeRegex: " Premium ",
          excludeRegex: " Expired ",
          excludedNodeNames: ["Slow", "Slow"],
        },
        {
          id: "disabled",
          name: "Disabled",
          enabled: false,
          groupType: "unknown",
        },
      ],
      customRules: [{ type: "DOMAIN", value: "example.com", target: "Fast" }],
      customRuleSets: [{ id: "set", target: "Fast" }],
      builtinRuleEdits: { "module:ai:openai": { target: "Fast" } },
      dialerProxyGroups: [{ id: "relay", relayNodes: ["Fast", "Node"] }],
      proxyGroupOrder: ["filtered:fast", "module:auto"],
    };

    const migrated = migrateFilteredProxyGroupsConfig(original);

    expect(migrated).not.toBe(original);
    expect(migrated).not.toHaveProperty("filteredProxyGroups");
    expect(migrated.customProxyGroups).toEqual([
      original.customProxyGroups[0],
      {
        id: "migrated-filtered-fast",
        name: "Fast (2)",
        emoji: "F",
        description: "从旧版筛选代理组迁移",
        memberSource: "filtered-nodes",
        includeInGroupMembers: true,
        groupType: "load-balance",
        strategy: "round-robin",
        advanced: {
          sourceIds: ["airport"],
          regions: ["us", "hk"],
          includeRegex: "Premium",
          excludeRegex: "Expired",
          excludedMembers: [{ kind: "node", name: "Slow" }],
        },
      },
      {
        id: "migrated-filtered-disabled",
        name: "Disabled",
        emoji: "",
        enabled: false,
        description: "从旧版筛选代理组迁移",
        memberSource: "filtered-nodes",
        includeInGroupMembers: true,
        groupType: "select",
        advanced: {},
      },
    ]);
    expect(migrated.customRules[0].target).toBe("Fast (2)");
    expect(migrated.customRuleSets[0].target).toBe("Fast (2)");
    expect(migrated.builtinRuleEdits["module:ai:openai"].target).toBe("Fast (2)");
    expect(migrated.dialerProxyGroups[0].relayNodes).toEqual(["Fast (2)", "Node"]);
    expect(migrated.proxyGroupOrder).toEqual(["custom:migrated-filtered-fast", "module:auto"]);
    expect(original).toHaveProperty("filteredProxyGroups");
  });

  it("is idempotent after the legacy field has been removed", () => {
    const migrated = migrateFilteredProxyGroupsConfig({
      customProxyGroups: [],
      filteredProxyGroups: [{ id: "one", name: "One", enabled: true, groupType: "select" }],
    });

    expect(migrateFilteredProxyGroupsConfig(migrated)).toBe(migrated);
  });

  it("reuses a group migrated by an earlier save instead of appending a duplicate", () => {
    const original = {
      filteredProxyGroups: [{ id: "home", name: "Home", enabled: true, groupType: "select" }],
      customProxyGroups: [
        {
          id: "migrated-filtered-home",
          name: "Home",
          emoji: "",
          memberSource: "filtered-nodes",
          includeInGroupMembers: true,
          groupType: "select",
          advanced: { sourceIds: ["airport"] },
        },
      ],
      proxyGroupOrder: ["filtered:home"],
    };

    const migrated = migrateFilteredProxyGroupsConfig(original);

    expect(migrated.customProxyGroups).toEqual(original.customProxyGroups);
    expect(migrated.proxyGroupOrder).toEqual(["custom:migrated-filtered-home"]);
    expect(migrated).not.toHaveProperty("filteredProxyGroups");
  });

  it("moves legacy rule overrides, exclusions, and custom group rules into the current rule model", () => {
    const original = {
      customProxyGroups: [
        {
          id: "custom",
          name: "Custom",
          emoji: "",
          groupType: "select",
          rules: [{ id: "private", name: "Private", url: "geoip/private.mrs" }],
        },
      ],
      customRuleSets: [{ id: "existing", name: "Existing", behavior: "domain", path: "geosite/existing.mrs", target: "Custom" }],
      builtinRuleEdits: { "module:ai:anthropic": { target: "Existing" } },
      moduleRuleOverrides: {
        google: [
          { id: "openai", name: "OpenAI", behavior: "domain", path: "geosite/openai.mrs" },
          { id: "custom-search", name: "Custom Search", behavior: "domain", path: "geosite/search.mrs" },
        ],
      },
      moduleRuleExclusions: { ai: ["openai", "anthropic"] },
      proxyGroupNameOverrides: { google: "Search" },
      ruleOrder: ["custom-group:custom:private", "module:google:openai", "module:google:custom-search"],
      allRulesOrderEditingEnabled: true,
    };

    const migrated = migrateFilteredProxyGroupsConfig(original);

    expect(migrated.customProxyGroups).toEqual([
      { id: "custom", name: "Custom", emoji: "", groupType: "select" },
    ]);
    expect(migrated.customRuleSets).toEqual([
      original.customRuleSets[0],
      {
        id: "private",
        name: "Private",
        behavior: "ipcidr",
        path: "geoip/private.mrs",
        target: "Custom",
        noResolve: true,
      },
      {
        id: "custom-search",
        name: "Custom Search",
        behavior: "domain",
        path: "geosite/search.mrs",
        target: "🔍 Search",
      },
    ]);
    expect(migrated.builtinRuleEdits).toEqual({
      "module:ai:openai": { target: "🔍 Search" },
      "module:ai:anthropic": { target: "Existing" },
    });
    expect(migrated.ruleOrder).toEqual([
      "custom-rule-set:private",
      "module:ai:openai",
      "custom-rule-set:custom-search",
    ]);
    expect(migrated).not.toHaveProperty("moduleRuleOverrides");
    expect(migrated).not.toHaveProperty("moduleRuleExclusions");
    expect(migrated).not.toHaveProperty("allRulesOrderEditingEnabled");
    expect(migrateFilteredProxyGroupsConfig(migrated)).toBe(migrated);
  });
});
