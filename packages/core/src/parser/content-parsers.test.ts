import { describe, expect, it } from "vitest";
import {
  formatParseSegmentError,
  isClashYamlContent,
  parseConfigLineSubscriptionContent,
  parseLineBasedSubscriptionContent,
  parseSubscriptionContentByRegistry,
  splitNodeLinkSegments,
} from "./content-parsers";
import { encodeBase64 } from "./base64";

function ssLink(name = "SS Node"): string {
  return `ss://${encodeBase64("aes-128-gcm:secret")}@ss.example.com:8388#${encodeURIComponent(name)}`;
}

describe("content parser registry helpers", () => {
  it("splits pipe-separated link lines only when every segment is link-like", () => {
    const first = ssLink("A");
    const second = ssLink("B");

    expect(splitNodeLinkSegments(`# comment\n${first}|${second}\nplain | text`)).toEqual([
      first,
      second,
      "plain | text",
    ]);
  });

  it("detects Clash YAML by sections or inline proxy fields", () => {
    expect(isClashYamlContent("proxy-providers: {}")).toBe(true);
    expect(isClashYamlContent("- type: hysteria2\n  server: hy2.example.com\n  ports: 10000-10100")).toBe(true);
    expect(isClashYamlContent("ss://not-yaml")).toBe(false);
  });

  it("parses link lines and keeps per-segment errors", () => {
    const result = parseLineBasedSubscriptionContent(`${ssLink()}\nftp://not-supported`);

    expect(result.nodes).toHaveLength(1);
    expect(result.totalParsed).toBe(1);
    expect(result.totalFailed).toBe(1);
    expect(result.errors[0]).toContain("解析失败: ftp://not-supported");
  });

  it("parses config lines and platform proxy lines", () => {
    const result = parseConfigLineSubscriptionContent(`
; comment
Line = ss, ss-line.example.com, 8388, encrypt-method=aes-128-gcm, password=secret
Bad = ss, missing-port
`);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toMatchObject({
      name: "Line",
      type: "ss",
      server: "ss-line.example.com",
      port: 8388,
    });
    expect(result.errors).toHaveLength(1);
  });

  it("routes through YAML, config-line, and link fallbacks", () => {
    const yaml = parseSubscriptionContentByRegistry(`
proxies:
  - name: YAML
    type: ss
    server: yaml.example.com
    port: 8388
    cipher: aes-128-gcm
    password: secret
`);
    const configLine = parseSubscriptionContentByRegistry(
      "Line = ss, ss-line.example.com, 8388, encrypt-method=aes-128-gcm, password=secret"
    );
    const linkLine = parseSubscriptionContentByRegistry(ssLink("Link"));

    expect(yaml.nodes[0]).toMatchObject({ name: "YAML", type: "ss" });
    expect(configLine.nodes[0]).toMatchObject({ name: "Line", type: "ss" });
    expect(linkLine.nodes[0]).toMatchObject({ name: "Link", type: "ss" });
  });

  it("formats unknown parse errors with a stable fallback reason", () => {
    expect(formatParseSegmentError("x".repeat(60), "bad")).toBe(`${"x".repeat(50)}... - 未知错误`.replace(/^/, "解析失败: "));
  });
});
