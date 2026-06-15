import { describe, expect, it } from "vitest";
import { getModulesForTemplate } from "@subboost/core/generator/proxy-groups";
import { validateSubBoostTemplateConfig } from "@subboost/core/templates/config-template";
import { expectInvalid, validConfig } from "./config-template.test-helpers";

describe("validateSubBoostTemplateConfig field validation", () => {
  it("rejects invalid dialer, module rule, scalar, and URL fields", () => {
    const moduleId = getModulesForTemplate("minimal")[0];

    expectInvalid({ dialerProxyGroups: "bad" as never }, "dialerProxyGroups 必须是数组");
    expectInvalid({ dialerProxyGroups: [1 as never] }, "dialerProxyGroups 只能包含对象");
    expectInvalid(
      {
        dialerProxyGroups: [
          {
            id: "",
            name: "Relay",
            type: "select",
            relayNodes: [],
            targetNodes: [],
          },
        ],
      },
      "dialerProxyGroups.id 不能为空"
    );
    expectInvalid(
      {
        dialerProxyGroups: [
          {
            id: "relay",
            name: "",
            type: "select",
            relayNodes: [],
            targetNodes: [],
          },
        ],
      },
      "dialerProxyGroups.name 不能为空"
    );
    expect(
      validateSubBoostTemplateConfig(
        validConfig({
          dialerProxyGroups: [
            {
              id: "relay",
              name: "Relay",
              type: "fallback" as never,
              relayNodes: [],
              targetNodes: [],
            },
          ],
        })
      )
    ).toEqual({ ok: false, error: "dialerProxyGroups.type 无效" });
    expectInvalid(
      {
        dialerProxyGroups: [
          {
            id: "relay",
            name: "Relay",
            type: "select",
            relayNodes: [1 as never],
            targetNodes: [],
          },
        ],
      },
      "dialerProxyGroups.relayNodes 只能包含字符串"
    );
    expectInvalid(
      {
        dialerProxyGroups: [
          {
            id: "relay",
            name: "Relay",
            type: "select",
            relayNodes: [],
            targetNodes: [],
            enabled: "yes" as never,
          },
        ],
      },
      "dialerProxyGroups.enabled 必须是布尔值"
    );

    expectInvalid({ moduleRuleOverrides: "bad" as never }, "moduleRuleOverrides 必须是对象");
    expectInvalid(
      { moduleRuleOverrides: { unknown: [] } as never },
      "moduleRuleOverrides 包含未知代理组"
    );
    expectInvalid(
      { moduleRuleOverrides: { [moduleId]: "bad" } as never },
      "moduleRuleOverrides 的值必须是数组"
    );
    expectInvalid(
      { moduleRuleOverrides: { [moduleId]: [1] } as never },
      "moduleRuleOverrides 只能包含对象"
    );
    expectInvalid(
      {
        moduleRuleOverrides: {
          [moduleId]: [
            {
              id: "bad",
              name: "Bad",
              behavior: "bad",
              path: "geoip/private.mrs",
            },
          ],
        } as never,
      },
      "moduleRuleOverrides.behavior 无效"
    );
    expect(
      validateSubBoostTemplateConfig(
        validConfig({
          moduleRuleOverrides: {
            [moduleId]: [
              {
                id: "bad",
                name: "Bad",
                behavior: "domain",
                path: "https://rules.example.com/bad.mrs",
              },
            ],
          },
        })
      )
    ).toEqual({ ok: false, error: "moduleRuleOverrides.path 无效" });
    expectInvalid(
      {
        moduleRuleOverrides: {
          [moduleId]: [
            {
              id: "bad",
              name: "Bad",
              behavior: "domain",
              path: "geosite/private.mrs",
              noResolve: "yes",
            },
          ],
        } as never,
      },
      "moduleRuleOverrides.noResolve 必须是布尔值"
    );

    expectInvalid({ moduleRuleExclusions: "bad" as never }, "moduleRuleExclusions 必须是对象");
    expect(
      validateSubBoostTemplateConfig(
        validConfig({
          moduleRuleExclusions: {
            unknown: ["rule"],
          },
        })
      )
    ).toEqual({ ok: false, error: "moduleRuleExclusions 包含未知代理组" });
    expectInvalid(
      { moduleRuleExclusions: { [moduleId]: [1] } as never },
      "moduleRuleExclusions 只能包含字符串"
    );

    expect(validateSubBoostTemplateConfig(validConfig({ allowLan: "yes" as never }))).toEqual({
      ok: false,
      error: "allowLan 必须是布尔值",
    });
    expectInvalid({ allRulesOrderEditingEnabled: "yes" as never }, "allRulesOrderEditingEnabled 必须是布尔值");
    expectInvalid({ cnIpNoResolve: "yes" as never }, "cnIpNoResolve 必须是布尔值");
    expectInvalid(
      { experimentalCnUseCnRuleSet: "yes" as never },
      "experimentalCnUseCnRuleSet 必须是布尔值"
    );
    expect(validateSubBoostTemplateConfig(validConfig({ dnsYaml: 1 as never }))).toEqual({
      ok: false,
      error: "dnsYaml 必须是字符串",
    });
    expect(validateSubBoostTemplateConfig(validConfig({ testUrl: "ftp://example.com" }))).toEqual({
      ok: false,
      error: "testUrl 必须是 http(s) URL",
    });
    expectInvalid({ ruleProviderBaseUrl: "ftp://example.com" }, "ruleProviderBaseUrl 必须是 http(s) URL");
    expectInvalid({ proxyGroupNameOverrides: "bad" as never }, "proxyGroupNameOverrides 必须是对象");
    expect(
      validateSubBoostTemplateConfig(
        validConfig({
          proxyGroupNameOverrides: {
            bad: 1 as never,
          },
        })
      )
    ).toEqual({ ok: false, error: "proxyGroupNameOverrides 的值必须是字符串" });
  });
});
