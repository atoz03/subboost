import { describe, expect, it } from "vitest";
import type { ParsedNode } from "@subboost/core/types/node";
import type { RefreshNodeSnapshotResult } from "./refresh-node-snapshot";
import { prepareRefreshCacheResult } from "./refresh-cache-result";

const node: ParsedNode = {
  name: "node-a",
  type: "trojan",
  server: "node-a.example.com",
  port: 443,
  password: "secret",
};

function snapshot(patch: Partial<RefreshNodeSnapshotResult> = {}): RefreshNodeSnapshotResult {
  return {
    nodes: [node],
    subscriptionInfo: {},
    savedSources: [],
    attemptedUrlFetch: false,
    usedUrlFetch: false,
    refreshableSourceCount: 0,
    refreshedSourceCount: 0,
    refreshedUrlSourceCount: 0,
    refreshedStaticSourceCount: 0,
    detachedSourceCount: 0,
    failedSourceCount: 0,
    failedSources: [],
    ...patch,
  };
}

describe("prepareRefreshCacheResult", () => {
  it("keeps previous cache when every refreshable source failed", () => {
    expect(
      prepareRefreshCacheResult({
        config: {},
        snapshot: snapshot({
          refreshableSourceCount: 2,
          refreshedSourceCount: 0,
          nodes: [node],
        }),
        maxNodesPerSubscription: 10,
      })
    ).toMatchObject({
      ok: false,
      reason: "all_sources_failed",
      nodeCount: 1,
    });
  });

  it("rejects empty snapshots unless proxy providers can still generate output", () => {
    expect(
      prepareRefreshCacheResult({
        config: {},
        snapshot: snapshot({ nodes: [] }),
        maxNodesPerSubscription: 10,
      })
    ).toMatchObject({
      ok: false,
      reason: "empty_result",
      nodeCount: 0,
    });

    const providerOnly = prepareRefreshCacheResult({
      config: { enabledGroups: ["select", "final"], enabledRules: ["final"] },
      snapshot: snapshot({ nodes: [] }),
      maxNodesPerSubscription: 10,
      proxyProviders: {
        remote: {
          type: "http",
          url: "https://provider.example.com/sub.yaml",
          path: "./remote.yaml",
        },
      },
    });

    expect(providerOnly.ok).toBe(true);
    if (!providerOnly.ok) return;
    expect(providerOnly.nodeCount).toBe(0);
    expect(providerOnly.generatedYaml).toContain("proxy-providers:");
    expect(providerOnly.cacheEntry.nodes).toEqual([]);
  });

  it("enforces node quota before generating YAML", () => {
    expect(
      prepareRefreshCacheResult({
        config: {},
        snapshot: snapshot({ nodes: [node, { ...node, name: "node-b" }] }),
        maxNodesPerSubscription: 1,
      })
    ).toMatchObject({
      ok: false,
      reason: "node_quota_exceeded",
      nodeCount: 2,
      maxNodesPerSubscription: 1,
    });
  });

  it("returns cache entries with generated YAML for valid snapshots", () => {
    const result = prepareRefreshCacheResult({
      config: {
        testUrl: "https://probe.example.com/204",
        testInterval: 120,
      },
      snapshot: snapshot({
        subscriptionInfo: {
          upload: 1,
          download: 2,
          total: 3,
        },
      }),
      maxNodesPerSubscription: 10,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nodeCount).toBe(1);
    expect(result.generatedYaml).toContain("node-a");
    expect(result.cacheEntry).toMatchObject({
      nodes: [node],
      subscriptionInfo: {
        upload: 1,
        download: 2,
        total: 3,
      },
    });
  });
});
