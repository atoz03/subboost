import { describe, expect, it } from "vitest";
import {
  generateProxyGroups,
  generateRuleProviders,
  getAllGroupNames,
  getGroupTarget,
  getModulesForTemplate,
} from "./proxy-groups";
import type { CustomProxyGroup } from "@subboost/core/types/config";
import type { ParsedNode } from "@subboost/core/types/node";

function node(name: string): ParsedNode {
  return {
    name,
    type: "ss",
    server: `${name.toLowerCase().replace(/\s+/g, "-")}.example.com`,
    port: 8388,
    cipher: "aes-128-gcm",
    password: "secret",
  } as ParsedNode;
}

function customGroup(id: string, groupType: CustomProxyGroup["groupType"]): CustomProxyGroup {
  return {
    id,
    name: `Custom ${id}`,
    emoji: "C",
    groupType,
    strategy: groupType === "load-balance" ? "round-robin" : undefined,
    rules: [{ id: `${id}-rule`, name: `${id} rule`, behavior: "domain", url: `https://rules.example.com/${id}.mrs` }],
  };
}

describe("proxy group generator", () => {
  it("generates module, filtered, custom, and provider-backed groups", () => {
    const groups = generateProxyGroups({
      nodes: [node("Node A"), node("Node B")],
      proxyProviderNames: ["remote"],
      enabledModules: ["select", "auto", "ad", "private", "cn", "global", "final", "ai"],
      ruleProviderBaseUrl: "https://rules.example.com",
      testUrl: "https://probe.example.com/204",
      testInterval: 120,
      filteredProxyGroups: [
        {
          id: "fast",
          name: "US Fast",
          enabled: true,
          groupType: "load-balance",
          strategy: "round-robin",
          sourceIds: [],
          regions: [],
          includeRegex: "Node A",
        },
        {
          id: "reject",
          name: "Reject Filter",
          enabled: true,
          groupType: "reject-first",
          sourceIds: [],
          regions: [],
          excludedNodeNames: ["Node B"],
        },
      ],
      customProxyGroups: [
        customGroup("select", "select"),
        customGroup("url", "url-test"),
        customGroup("fallback", "fallback"),
        customGroup("balance", "load-balance"),
        customGroup("direct", "direct-first"),
        customGroup("reject", "reject-first"),
      ],
    });

    expect(groups.find((group) => group.name === "US Fast")).toMatchObject({
      type: "load-balance",
      proxies: ["Node A"],
      strategy: "round-robin",
      url: "https://probe.example.com/204",
      interval: 120,
    });
    expect(groups.find((group) => group.name === "Reject Filter")).toMatchObject({
      type: "select",
      proxies: ["REJECT", "DIRECT", "Node A"],
    });
    expect(groups.find((group) => group.name === "Custom url")).toMatchObject({
      type: "url-test",
      use: ["remote"],
      lazy: false,
    });
    expect(groups.find((group) => group.name === "Custom fallback")).toMatchObject({ type: "fallback" });
    expect(groups.find((group) => group.name === "Custom balance")).toMatchObject({
      type: "load-balance",
      strategy: "round-robin",
    });
    expect(groups.find((group) => group.name === "Custom direct")?.proxies?.[0]).toBe("DIRECT");
    expect(groups.find((group) => group.name === "Custom reject")?.proxies?.[0]).toBe("REJECT");
    expect(groups.find((group) => group.name.includes("节点选择"))).toMatchObject({
      type: "select",
      use: ["remote"],
    });
  });

  it("generates providers and template metadata helpers", () => {
    const providers = generateRuleProviders({
      nodes: [node("Node A")],
      enabledModules: ["cn"],
      ruleProviderBaseUrl: "https://rules.example.com",
      testUrl: "https://probe.example.com/204",
      testInterval: 120,
      experimentalCnUseCnRuleSet: true,
      moduleRuleExclusions: { cn: ["geolocation-cn"] },
      customProxyGroups: [customGroup("custom", "select")],
    });

    expect(providers["cn-ip"]).toMatchObject({
      url: "https://rules.example.com/geoip/cn.mrs",
      behavior: "ipcidr",
    });
    expect(providers.cn).toMatchObject({
      url: "https://rules.example.com/geosite/cn.mrs",
    });
    expect(providers["custom-rule"]).toMatchObject({
      url: "https://rules.example.com/custom.mrs",
    });
    expect(getModulesForTemplate("minimal")).toContain("final");
    expect(getModulesForTemplate("standard")).toContain("github");
    expect(getModulesForTemplate("full")).not.toContain("adult");
    expect(getGroupTarget("missing")).toContain("节点选择");
    expect(getAllGroupNames(["select"], [customGroup("custom", "select")])).toContain("Custom custom");
  });
});
