import { describe, expect, it } from "vitest";
import { validateSubBoostTemplateConfig } from "@subboost/core/templates/config-template";
import { expectInvalid, validConfig } from "./config-template.test-helpers";

describe("validateSubBoostTemplateConfig field validation", () => {
  it("rejects invalid dialer, module rule, scalar, and URL fields", () => {
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

    expectInvalid({ customRuleSets: "bad" as never }, "customRuleSets 必须是数组");
    expectInvalid(
      { customRuleSets: [1 as never] },
      "customRuleSets 只能包含对象"
    );
    expectInvalid(
      {
        customRuleSets: [
          {
            id: "bad",
            name: "Bad",
            behavior: "bad" as never,
            path: "geoip/private.mrs",
            target: "DIRECT",
          },
        ],
      },
      "customRuleSets.behavior 无效"
    );
    expectInvalid(
      {
        customRuleSets: [
          {
            id: "bad",
            name: "Bad",
            behavior: "domain",
            path: "plain/rule.txt",
            target: "DIRECT",
          },
        ],
      },
      "customRuleSets.path 无效"
    );
    expectInvalid(
      {
        customRuleSets: [
          {
            id: "bad",
            name: "Bad",
            behavior: "domain",
            path: "geosite/private.mrs",
            target: "DIRECT",
            noResolve: "yes" as never,
          },
        ],
      },
      "customRuleSets.noResolve 必须是布尔值"
    );

    expectInvalid({ builtinRuleEdits: "bad" as never }, "builtinRuleEdits 必须是对象");
    expectInvalid(
      {
        builtinRuleEdits: {
          "module:missing:rule": { enabled: false },
        } as never,
      },
      "builtinRuleEdits 包含未知内置规则"
    );
    expectInvalid(
      {
        builtinRuleEdits: {
          "module:cn:geolocation-cn": "bad",
        } as never,
      },
      "builtinRuleEdits 的值必须是对象"
    );
    expectInvalid(
      {
        builtinRuleEdits: {
          "module:cn:geolocation-cn": { target: 1 },
        } as never,
      },
      "builtinRuleEdits.target 必须是字符串"
    );
    expectInvalid(
      {
        builtinRuleEdits: {
          "module:cn:geolocation-cn": { enabled: true },
        } as never,
      },
      "builtinRuleEdits.enabled 只能是 false"
    );

    expect(validateSubBoostTemplateConfig(validConfig({ allowLan: "yes" as never }))).toEqual({
      ok: false,
      error: "allowLan 必须是布尔值",
    });
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
