import { describe, expect, it } from "vitest";
import { initialState } from "@subboost/ui/store/config-store/definitions";
import { buildConfigTransferDocument, parseConfigTransferDocument } from "./config-transfer";

describe("local config transfer", () => {
  it("exports and validates the v2.6 proxy-group and rule model", () => {
    const document = buildConfigTransferDocument(initialState);

    expect(document).toMatchObject({
      schema: "subboost-config-transfer/v1",
      app: "subboost-local",
      config: {
        schema: "subboost-template-config/v1",
        proxyGroupAdvanced: {},
        proxyGroupAdvancedModeEnabled: false,
        customRuleSets: [],
        builtinRuleEdits: {},
      },
    });
    expect(document.config).not.toHaveProperty("filteredProxyGroups");
    expect(document.config).not.toHaveProperty("moduleRuleOverrides");
    expect(parseConfigTransferDocument(document)).toMatchObject({
      template: initialState.template,
      enabledProxyGroups: initialState.enabledProxyGroups,
      proxyGroupAdvanced: {},
      customRuleSets: [],
      builtinRuleEdits: {},
    });
  });
});
