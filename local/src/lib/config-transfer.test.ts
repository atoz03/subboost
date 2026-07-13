import { describe, expect, it } from "vitest";
import { initialState, type ConfigState } from "@subboost/ui/store/config-store/definitions";
import { buildConfigTransferDocument, parseConfigTransferDocument } from "./config-transfer";

describe("local config transfer", () => {
  it("exports and validates the complete workspace backup", () => {
    const document = buildConfigTransferDocument(initialState);

    expect(document).toMatchObject({
      schema: "subboost-config-transfer/v2",
      app: "subboost-local",
      config: {
        schema: "subboost-template-config/v1",
        proxyGroupAdvanced: {},
        proxyGroupAdvancedModeEnabled: false,
        customRuleSets: [],
        builtinRuleEdits: {},
      },
      workspace: {
        nodes: [],
        sources: initialState.sources,
        listenerPorts: {},
      },
    });
    expect(document.config).not.toHaveProperty("filteredProxyGroups");
    expect(document.config).not.toHaveProperty("moduleRuleOverrides");
    expect(parseConfigTransferDocument(document)).toMatchObject({
      config: {
        template: initialState.template,
        enabledProxyGroups: initialState.enabledProxyGroups,
        proxyGroupAdvanced: {},
        customRuleSets: [],
        builtinRuleEdits: {},
      },
      workspace: {
        nodes: [],
        sources: initialState.sources,
      },
    });
  });

  it("preserves raw node fields, sources, deleted nodes, and listener ports", () => {
    const state = {
      ...initialState,
      nodes: [
        {
          name: "保留字段",
          type: "vless",
          server: "example.com",
          port: 443,
          uuid: "11111111-1111-1111-1111-111111111111",
          realityOpts: { sid: "abc" },
        },
      ] as ConfigState["nodes"],
      sources: [{ id: "source-1", type: "yaml" as const, content: "proxies: []", name: "原始 YAML" }],
      deletedNodeNames: ["已删除"],
      deletedNodes: [{ originName: "已删除", name: "已删除", listenerPort: 7890 }],
      listenerPorts: { "保留字段": 7891 },
      proxyGroupOrder: ["module:global"],
    };

    const parsed = parseConfigTransferDocument(buildConfigTransferDocument(state));
    expect(parsed.workspace).toMatchObject({
      nodes: state.nodes,
      sources: state.sources,
      deletedNodeNames: state.deletedNodeNames,
      deletedNodes: state.deletedNodes,
      listenerPorts: state.listenerPorts,
      proxyGroupOrder: state.proxyGroupOrder,
    });
  });

  it("continues to accept old template-only transfer files", () => {
    const current = buildConfigTransferDocument(initialState);
    const parsed = parseConfigTransferDocument({
      schema: "subboost-config-transfer/v1",
      config: current.config,
    });

    expect(parsed.config.template).toBe(initialState.template);
    expect(parsed.workspace).toBeUndefined();
  });
});
