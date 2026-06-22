import { describe, expect, it } from "vitest";
import { validateSubBoostTemplateConfig } from "@subboost/core/templates/config-template";
import { expectInvalid, validConfig } from "./config-template.test-helpers";

describe("validateSubBoostTemplateConfig custom and filtered groups", () => {
  it("rejects invalid custom and filtered group fields", () => {
    expectInvalid({ customRules: "bad" as never }, "customRules 必须是数组");
    expectInvalid({ customRules: [1 as never] }, "customRules 只能包含对象");
    expectInvalid(
      {
        customRules: [
          {
            id: "bad",
            type: "BAD" as never,
            value: "example.com",
            target: "DIRECT",
          },
        ],
      },
      "customRules 包含无效类型"
    );
    expectInvalid(
      {
        customRules: [
          {
            id: "bad",
            type: "DOMAIN",
            value: " ",
            target: "DIRECT",
          },
        ],
      },
      "customRules.value 不能为空"
    );
    expectInvalid(
      {
        customRules: [
          {
            id: "bad",
            type: "DOMAIN",
            value: "example.com",
            target: " ",
          },
        ],
      },
      "customRules.target 不能为空"
    );
    expectInvalid(
      {
        customRules: [
          {
            id: "bad",
            type: "DOMAIN",
            value: "example.com",
            target: "DIRECT",
            noResolve: "yes" as never,
          },
        ],
      },
      "customRules.noResolve 必须是布尔值"
    );

    const generatedRuleId = validateSubBoostTemplateConfig(
      validConfig({
        customRules: [
          {
            type: "DOMAIN",
            value: "example.com",
            target: "DIRECT",
          } as never,
        ],
      })
    );
    expect(generatedRuleId.ok).toBe(true);
    if (generatedRuleId.ok) {
      expect(generatedRuleId.config.customRules[0].id).toBe(
        "custom-rule-domain-example-com-direct-1"
      );
    }

    expectInvalid({ customProxyGroups: "bad" as never }, "customProxyGroups 必须是数组");
    expectInvalid({ customProxyGroups: [1 as never] }, "customProxyGroups 只能包含对象");
    expectInvalid(
      {
        customProxyGroups: [
          {
            id: "",
            name: "Custom",
            emoji: "C",
            groupType: "select",
          },
        ],
      },
      "customProxyGroups.id 不能为空"
    );
    expectInvalid(
      {
        customProxyGroups: [
          {
            id: "custom",
            name: "",
            emoji: "C",
            groupType: "select",
          },
        ],
      },
      "customProxyGroups.name 不能为空"
    );
    expectInvalid(
      {
        customProxyGroups: [
          {
            id: "custom",
            name: "Custom",
            emoji: "C",
            groupType: "bad" as never,
          },
        ],
      },
      "customProxyGroups.groupType 无效"
    );
    expectInvalid({ proxyGroupAdvanced: [] as never }, "proxyGroupAdvanced 必须是对象");
    expectInvalid(
      {
        proxyGroupAdvanced: {
          missing: {},
        },
      },
      "proxyGroupAdvanced 包含未知代理组"
    );

    expect(
      validateSubBoostTemplateConfig(
        validConfig({
          customProxyGroups: [
            {
              id: "custom",
              name: "Custom",
              emoji: "C",
              groupType: "load-balance",
              strategy: "bad" as never,
            },
          ],
        })
      )
    ).toEqual({ ok: false, error: "customProxyGroups.strategy 无效" });

    expect(
      validateSubBoostTemplateConfig(
        validConfig({
          filteredProxyGroups: [
            {
              id: "legacy",
              name: "Legacy",
              enabled: true,
              groupType: "select",
              sourceIds: ["source-a"],
              regions: ["moon" as never, "hk"],
              excludedNodeNames: ["Node A"],
            },
          ],
        })
      )
    ).toMatchObject({
      ok: true,
      config: {
        customProxyGroups: [
          expect.objectContaining({
            id: "migrated-filtered-legacy",
            name: "Legacy",
            advanced: {
              sourceIds: ["source-a"],
              regions: ["hk"],
              excludedMembers: [{ kind: "node", name: "Node A" }],
            },
          }),
        ],
      },
    });
  });
});
