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

  it("accepts a template document without a transfer wrapper", () => {
    const current = buildConfigTransferDocument(initialState);
    expect(parseConfigTransferDocument(current.config).config.template).toBe(initialState.template);
  });

  it("rejects invalid document and workspace shapes", () => {
    for (const value of [null, false, "bad", []]) {
      expect(() => parseConfigTransferDocument(value)).toThrow("配置文件格式无效");
    }
    expect(() => parseConfigTransferDocument({ schema: "unknown" })).toThrow();

    const original = buildConfigTransferDocument(initialState);
    const invalidCases: Array<[string, (document: any) => void]> = [
      ["完整备份缺少工作区数据", (document) => { document.workspace = null; }],
      ["nodes 必须是节点数组", (document) => { document.workspace.nodes = {}; }],
      ["nodes[0] 不是有效节点", (document) => { document.workspace.nodes = [null]; }],
      ["nodes[0] 不是有效节点", (document) => { document.workspace.nodes = [{ name: 1, type: "ss" }]; }],
      ["nodes[0] 不是有效节点", (document) => { document.workspace.nodes = [{ name: "n", type: 1 }]; }],
      ["deletedNodeNames 必须是字符串数组", (document) => { document.workspace.deletedNodeNames = [1]; }],
      ["deletedNodes 必须是数组", (document) => { document.workspace.deletedNodes = {}; }],
      ["deletedNodes[0] 无效", (document) => { document.workspace.deletedNodes = [null]; }],
      ["deletedNodes[0] 无效", (document) => { document.workspace.deletedNodes = [{ originName: 1, name: "n" }]; }],
      ["deletedNodes[0] 无效", (document) => { document.workspace.deletedNodes = [{ originName: "o", name: 1 }]; }],
      ["deletedNodes[0].node[0] 不是有效节点", (document) => {
        document.workspace.deletedNodes = [{ originName: "o", name: "n", node: {} }];
      }],
      ["deletedNodes[0].listenerPort 无效", (document) => {
        document.workspace.deletedNodes = [{ originName: "o", name: "n", listenerPort: 0 }];
      }],
      ["deletedNodes[0].dialerRelayGroupIds 必须是字符串数组", (document) => {
        document.workspace.deletedNodes = [{ originName: "o", name: "n", dialerRelayGroupIds: [1] }];
      }],
      ["deletedNodes[0].dialerTargetGroupIds 必须是字符串数组", (document) => {
        document.workspace.deletedNodes = [{ originName: "o", name: "n", dialerTargetGroupIds: [1] }];
      }],
      ["parseErrors 必须是字符串数组", (document) => { document.workspace.parseErrors = null; }],
      ["sources 必须是导入源数组", (document) => { document.workspace.sources = {}; }],
      ["sources[0] 无效", (document) => { document.workspace.sources = [null]; }],
      ["sources[0] 无效", (document) => {
        document.workspace.sources = [{ id: 1, type: "url", content: "x" }];
      }],
      ["sources[0] 无效", (document) => {
        document.workspace.sources = [{ id: "s", type: "url", content: 1 }];
      }],
      ["sources[0] 无效", (document) => {
        document.workspace.sources = [{ id: "s", type: "file", content: "x" }];
      }],
      ["proxyGroupOrder 必须是字符串数组", (document) => { document.workspace.proxyGroupOrder = [1]; }],
      ["listenerPorts 必须是对象", (document) => { document.workspace.listenerPorts = []; }],
      ["listenerPorts 包含无效端口", (document) => { document.workspace.listenerPorts = { "": 7890 }; }],
      ["listenerPorts 包含无效端口", (document) => { document.workspace.listenerPorts = { node: 1.5 }; }],
      ["listenerPorts 包含无效端口", (document) => { document.workspace.listenerPorts = { node: 65536 }; }],
    ];

    for (const [message, mutate] of invalidCases) {
      const document = structuredClone(original);
      mutate(document);
      expect(() => parseConfigTransferDocument(document), message).toThrow(message);
    }
  });

  it("validates optional deleted-node metadata and the workspace warning flag", () => {
    const document = buildConfigTransferDocument({
      ...initialState,
      deletedNodes: [{
        originName: "old",
        name: "new",
        node: { name: "node", type: "direct" },
        listenerPort: 65535,
        dialerRelayGroupIds: ["relay"],
        dialerTargetGroupIds: ["target"],
      }],
      moduleRuleEditWarningAccepted: true,
    });
    expect(parseConfigTransferDocument(document).workspace).toMatchObject({
      moduleRuleEditWarningAccepted: true,
      deletedNodes: [{ listenerPort: 65535 }],
    });
  });
});
