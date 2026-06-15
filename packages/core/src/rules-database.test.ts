import { describe, expect, it } from "vitest";
import {
  ALL_RULES,
  GEOIP_RULES,
  GEOSITE_RULES,
  RULE_CATEGORIES,
  TOTAL_RULES_COUNT,
  createCustomRule,
  generateRuleUrl,
  getRuleById,
  getRulesByCategory,
  isValidRuleUrl,
  searchRules,
} from "./rules-database";

describe("rules database index", () => {
  it("exports a merged rule index and category metadata", () => {
    expect(TOTAL_RULES_COUNT).toBe(GEOSITE_RULES.length + GEOIP_RULES.length);
    expect(ALL_RULES).toHaveLength(TOTAL_RULES_COUNT);
    expect(RULE_CATEGORIES.ai.name).toBe("AI 服务");
    expect(GEOSITE_RULES[0]).toMatchObject({
      behavior: "domain",
      format: "mrs",
    });
    expect(GEOIP_RULES[0]).toMatchObject({
      id: "cn-ip",
      behavior: "ipcidr",
      format: "mrs",
    });
  });

  it("searches by id, English name, Chinese display name, and ignores empty input", () => {
    expect(searchRules(" openai ")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "openai",
          category: "ai",
        }),
      ])
    );
    expect(searchRules("TELEGRAM")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "telegram",
          category: "social",
        }),
      ])
    );
    expect(searchRules("电报")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "telegram",
        }),
      ])
    );
    expect(searchRules("   ")).toEqual([]);
  });

  it("finds rules by category and exact id", () => {
    const aiRules = getRulesByCategory("ai");

    expect(aiRules.length).toBeGreaterThan(0);
    expect(aiRules.every((rule) => rule.category === "ai")).toBe(true);
    expect(getRuleById("netflix")).toMatchObject({
      nameZh: "奈飞",
      category: "media",
    });
    expect(getRuleById("missing-rule")).toBeUndefined();
  });

  it("generates and validates rule URLs for built-in and custom sources", () => {
    expect(generateRuleUrl("openai")).toMatch(/\/geosite\/openai\.mrs$/);
    expect(generateRuleUrl("telegram", "geoip")).toMatch(/\/geoip\/telegram\.mrs$/);

    expect(
      createCustomRule("custom-domain", "custom-domain", "自定义域名", "domain")
    ).toMatchObject({
      id: "custom-domain",
      category: "other",
      behavior: "domain",
      url: expect.stringMatching(/\/geosite\/custom-domain\.mrs$/),
    });
    expect(
      createCustomRule(
        "custom-ip",
        "custom-ip",
        "自定义 IP",
        "ipcidr",
        "https://raw.githubusercontent.com/example/rules/custom-ip.mrs"
      )
    ).toMatchObject({
      id: "custom-ip",
      behavior: "ipcidr",
      url: "https://raw.githubusercontent.com/example/rules/custom-ip.mrs",
    });

    expect(isValidRuleUrl(generateRuleUrl("openai"))).toBe(true);
    expect(isValidRuleUrl("https://raw.githubusercontent.com/example/rules/list.mrs")).toBe(true);
    expect(isValidRuleUrl("https://cdn.jsdelivr.net/gh/example/rules/list.mrs")).toBe(true);
    expect(isValidRuleUrl("https://example.com/list.mrs")).toBe(false);
  });
});
