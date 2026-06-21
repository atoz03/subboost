import { describe, expect, it } from "vitest";

import {
  diffGeneratedYamlSemantics,
  hashGeneratedYamlSemantics,
  parseGeneratedYamlSemantics,
} from "./yaml-semantics";

describe("generated YAML semantics", () => {
  it("treats YAML formatting and mapping order changes as format-only", () => {
    const before = parseGeneratedYamlSemantics(`
mixed-port: 7897
rule-providers:
  google:
    type: http
    behavior: domain
    url: https://example.com/google.mrs
rules:
  - RULE-SET,google,Google
`);
    const after = parseGeneratedYamlSemantics(`
rule-providers:
  google: { behavior: domain, url: "https://example.com/google.mrs", type: http }
rules: ["RULE-SET,google,Google"]
mixed-port: 7897
`);

    expect(diffGeneratedYamlSemantics(before, after)).toMatchObject({
      changed: true,
      severity: "format-only",
      issues: [],
    });
  });

  it("reports removed rule providers as high impact", () => {
    const before = parseGeneratedYamlSemantics(`
rule-providers:
  google:
    type: http
    behavior: domain
rules:
  - RULE-SET,google,Google
`);
    const after = parseGeneratedYamlSemantics(`
rules:
  - MATCH,DIRECT
`);

    const diff = diffGeneratedYamlSemantics(before, after);
    expect(diff.severity).toBe("high");
    expect(diff.issues.map((issue) => issue.path)).toEqual(["rule-providers", "rules"]);
  });

  it("reports RULE-SET target changes as high impact", () => {
    const before = parseGeneratedYamlSemantics(`
rules:
  - RULE-SET,google,Google
`);
    const after = parseGeneratedYamlSemantics(`
rules:
  - RULE-SET,google,DIRECT
`);

    expect(diffGeneratedYamlSemantics(before, after)).toMatchObject({
      changed: true,
      severity: "high",
      issues: [expect.objectContaining({ path: "rules", severity: "high" })],
    });
  });

  it("keeps custom rule set output stable when provider fields are equivalent", () => {
    const before = parseGeneratedYamlSemantics(`
rule-providers:
  custom-google:
    type: http
    behavior: domain
    url: https://example.com/custom-google.mrs
    path: ./rules/custom-google.mrs
    interval: 86400
rules:
  - RULE-SET,custom-google,Google
`);
    const after = parseGeneratedYamlSemantics(`
rules:
  - RULE-SET,custom-google,Google
rule-providers:
  custom-google:
    interval: 86400
    path: ./rules/custom-google.mrs
    url: https://example.com/custom-google.mrs
    behavior: domain
    type: http
`);

    expect(diffGeneratedYamlSemantics(before, after).severity).toBe("format-only");
    expect(hashGeneratedYamlSemantics(before)).toBe(hashGeneratedYamlSemantics(after));
  });

  it("reports proxy group member order changes as high impact", () => {
    const before = parseGeneratedYamlSemantics(`
proxy-groups:
  - name: Select
    type: select
    proxies: [A, B]
`);
    const after = parseGeneratedYamlSemantics(`
proxy-groups:
  - name: Select
    type: select
    proxies: [B, A]
`);

    expect(diffGeneratedYamlSemantics(before, after)).toMatchObject({
      changed: true,
      severity: "high",
      issues: [expect.objectContaining({ path: "proxy-groups", severity: "high" })],
    });
  });
});
