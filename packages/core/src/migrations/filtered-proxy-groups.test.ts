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

  it("contains malformed legacy entries and resolves duplicate identifiers deterministically", () => {
    const migrated = migrateFilteredProxyGroupsConfig({
      customProxyGroups: [
        null,
        {
          id: "legacy",
          name: "Legacy",
          rules: [
            null,
            { id: "", url: "" },
            { id: "remote", name: "", url: "https://rules.example/remote.mrs", noResolve: true },
          ],
        },
        { id: "migrated-filtered-reused", name: "" },
      ],
      filteredProxyGroups: [
        null,
        { id: "", name: "Missing" },
        { id: "missing-name", name: "" },
        { id: "duplicate", name: "Duplicate" },
        { id: "duplicate", name: "Duplicate" },
        { id: "duplicate", name: "Duplicate" },
        { id: "reused", name: "Original" },
      ],
      customRuleSets: [null, { id: "remote", name: "Existing", path: "geosite/existing.mrs" }],
      moduleRuleOverrides: {
        "": [],
        malformed: "not-an-array",
        unknown: [
          null,
          { id: "", path: "" },
          { id: "invalid", path: "relative.txt" },
          { id: "remote", name: "", path: "https://rules.example/remote.mrs", noResolve: true },
        ],
        ai: [{ id: "openai", path: "geosite/openai.mrs" }],
        invalidTarget: [{ id: "move", path: "geoip/private.mrs" }],
      },
      moduleRuleExclusions: {
        "": [],
        malformed: "not-an-array",
        ai: ["", "no-override", "move", "already-edited"],
      },
      builtinRuleEdits: {
        "module:ai:already-edited": { target: "Duplicate" },
        "module:ai:invalid": null,
        "module:ai:no-target": {},
      },
      customRules: [null, { value: "untargeted" }, { target: "Duplicate" }],
      dialerProxyGroups: [
        null,
        {},
        { relayNodes: "invalid" },
        { relayNodes: [1, "Duplicate", "Unknown"] },
      ],
      proxyGroupOrder: [1, "module:auto", "filtered:missing", "filtered:duplicate"],
      proxyGroupNameOverrides: null,
      ruleOrder: [1, "unmapped"],
    } as any);

    expect(migrated.customProxyGroups).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "migrated-filtered-duplicate", name: "Duplicate" }),
      expect.objectContaining({ id: "migrated-filtered-duplicate-2", name: "Duplicate (2)" }),
      expect.objectContaining({ id: "migrated-filtered-duplicate-3", name: "Duplicate (3)" }),
    ]));
    expect(migrated.customRuleSets).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "remote-2", target: "Legacy", noResolve: true }),
      expect.objectContaining({ id: "remote-3", target: "unknown", noResolve: true }),
    ]));
    expect(migrated.builtinRuleEdits).toMatchObject({
      "module:ai:no-override": { enabled: false },
      "module:ai:move": { enabled: false },
    });
    expect(migrated.proxyGroupOrder).toEqual([1, "module:auto", "filtered:missing", "custom:migrated-filtered-duplicate-3"]);
    expect(migrated.ruleOrder).toEqual([1, "unmapped"]);
  });
});
