import { describe, expect, it } from "vitest";
import { getFilteredProxyGroupNodeNames, getFilteredProxyGroupProxies, REGION_PRESETS } from "./filtered-proxy-groups";
import type { FilteredProxyGroup } from "@subboost/core/types/filtered-proxy-group";
import type { ParsedNode } from "@subboost/core/types/node";

function node(name: string, sourceIds: string[] = []): ParsedNode {
  return {
    name,
    type: "ss",
    server: "proxy.example.com",
    port: 8388,
    cipher: "aes-128-gcm",
    password: "secret",
    _sourceIds: sourceIds,
  } as ParsedNode;
}

function group(patch: Partial<FilteredProxyGroup> = {}): FilteredProxyGroup {
  return {
    id: "filtered",
    name: "Filtered",
    enabled: true,
    groupType: "select",
    sourceIds: [],
    regions: [],
    excludedNodeNames: [],
    ...patch,
  };
}

describe("filtered proxy groups", () => {
  it("filters by source, region, regex, and explicit exclusions", () => {
    const nodes = [
      node("US Fast", ["airport-a"]),
      node("US IPv6", ["airport-a"]),
      node("Hong Kong Fast", ["airport-a"]),
      node("US Other Source", ["airport-b"]),
      node("Manual US"),
      { ...node("   ", ["airport-a"]), name: "" },
    ];

    expect(
      getFilteredProxyGroupNodeNames(
        nodes,
        group({
          sourceIds: ["airport-a"],
          regions: ["us"],
          includeRegex: "fast",
          excludeRegex: "ipv6",
          excludedNodeNames: ["US Other Source"],
        })
      )
    ).toEqual(["US Fast"]);
  });

  it("supports the other region and ignores invalid regular expressions", () => {
    const nodes = [node("US Fast"), node("Mars Relay"), node("No Region")];

    expect(
      getFilteredProxyGroupNodeNames(
        nodes,
        group({
          regions: ["other"],
          includeRegex: "[",
        })
      )
    ).toEqual(["Mars Relay", "No Region"]);
  });

  it("returns empty names for disabled or empty groups and prepends fixed proxies for enabled groups", () => {
    expect(getFilteredProxyGroupNodeNames([node("US Fast")], group({ enabled: false }))).toEqual([]);
    expect(getFilteredProxyGroupNodeNames([], group())).toEqual([]);
    expect(getFilteredProxyGroupProxies([node("US Fast")], group())).toEqual(["DIRECT", "REJECT", "US Fast"]);
  });

  it("keeps region presets stable for UI filters", () => {
    expect(REGION_PRESETS.map((preset) => preset.id)).toContain("other");
    expect(REGION_PRESETS.find((preset) => preset.id === "us")?.keywords).toContain("United States");
  });
});
