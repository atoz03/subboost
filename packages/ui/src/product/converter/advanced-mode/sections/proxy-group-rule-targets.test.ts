import { describe, expect, it } from "vitest";
import { buildManualRuleTargets, listCustomRulesForTarget } from "./proxy-group-rule-targets";

describe("proxy group rule targets", () => {
  it("lists custom rules that target the exact normalized group name", () => {
    const rules = [
      { target: "Proxy", payload: "A" },
      { target: " Proxy ", payload: "B" },
      { target: "Other", payload: "C" },
    ] as any[];

    expect(listCustomRulesForTarget(rules, " Proxy ")).toEqual([
      { rule: rules[0], index: 0 },
      { rule: rules[1], index: 1 },
    ]);
    expect(listCustomRulesForTarget(rules, " ")).toEqual([]);
  });

  it("builds enabled module, custom, and filtered targets", () => {
    const targets = buildManualRuleTargets({
      enabledProxyGroups: ["auto", "load-balance"],
      hiddenProxyGroups: ["load-balance"],
      customProxyGroups: [
        { id: "custom-1", name: " Custom " },
        { id: "", name: "Missing" },
        { id: "custom-2", name: " " },
      ],
      filteredProxyGroups: [
        { id: "filtered-1", name: " Filtered ", enabled: true },
        { id: "filtered-2", name: "Disabled", enabled: false },
      ],
      proxyGroupNameOverrides: { auto: "Auto Override" },
    } as any);

    expect(targets).toEqual([
      { kind: "module", id: "auto", name: "⚡ Auto Override" },
      { kind: "custom", id: "custom-1", name: "Custom" },
      { kind: "filtered", id: "filtered-1", name: "Filtered" },
    ]);
  });
});
