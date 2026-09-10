import { describe, expect, it } from "vitest";
import { configToYaml } from "@subboost/core/generator/yaml";
import { parseSubscription } from "@subboost/core/parser";
import type { ClashConfig } from "@subboost/core/types/config";
import { parseMierus } from "./mierus";

const TRAFFIC_PATTERN = "CCoQARoECAEQCiIYCAMQASoIMDAwMTAyMDMqCDA0MDUwNjA3";

describe("Mieru simple share links", () => {
  it("parses the official multi-binding format into Mihomo nodes", () => {
    const nodes = parseMierus(
      `mierus://baozi:manlianpenfen@1.2.3.4?handshake-mode=HANDSHAKE_NO_WAIT&mtu=1400&multiplexing=MULTIPLEXING_HIGH&port=6666&port=9998-9999&port=6489&port=4896&profile=default&protocol=TCP&protocol=TCP&protocol=UDP&protocol=UDP&traffic-pattern=${TRAFFIC_PATTERN}`
    );

    expect(nodes).toHaveLength(4);
    expect(nodes[0]).toMatchObject({
      name: "default [TCP 6666]",
      type: "mieru",
      server: "1.2.3.4",
      port: 6666,
      username: "baozi",
      password: "manlianpenfen",
      transport: "TCP",
      udp: true,
      multiplexing: "MULTIPLEXING_HIGH",
      "handshake-mode": "HANDSHAKE_NO_WAIT",
      "traffic-pattern": TRAFFIC_PATTERN,
    });
    expect(nodes[1]).toMatchObject({
      name: "default [TCP 9998-9999]",
      port: 9998,
      "port-range": "9998-9999",
      transport: "TCP",
    });
    expect(nodes[2]).toMatchObject({ name: "default [UDP 6489]", port: 6489, transport: "UDP" });
    expect(nodes[3]).toMatchObject({ name: "default [UDP 4896]", port: 4896, transport: "UDP" });
    expect(nodes[0]).not.toHaveProperty("mtu");
  });

  it("decodes credentials and IPv6 addresses and uses a fragment as the display name", () => {
    expect(
      parseMierus(
        "mierus://user%2Ename:p%40ss%3Aword@[2001:db8::1]?profile=ignored&port=2999&protocol=tcp#Los+Angeles"
      )
    ).toEqual([
      expect.objectContaining({
        name: "Los Angeles",
        server: "2001:db8::1",
        port: 2999,
        username: "user.name",
        password: "p@ss:word",
        transport: "TCP",
      }),
    ]);
  });

  it("expands all bindings through the subscription parser and emits valid range YAML", () => {
    const result = parseSubscription(
      "mierus://user:password@mieru.example.com?profile=Mieru&port=2999-3001&port=4000&protocol=TCP&protocol=UDP"
    );

    expect(result).toMatchObject({ totalParsed: 2, totalFailed: 0 });
    const yaml = configToYaml({
      proxies: result.nodes,
      "proxy-groups": [],
      "rule-providers": {},
      rules: [],
    } as unknown as ClashConfig);
    expect(yaml).toContain(
      'type: mieru, server: mieru.example.com, username: user, password: password, transport: TCP, port-range: 2999-3001'
    );
    expect(yaml).not.toContain("port: 2999, username");
    expect(yaml).toContain("port: 4000, username: user, password: password, transport: UDP");
  });

  it("rejects malformed singleton parameters and unpaired bindings", () => {
    expect(() =>
      parseMierus("mierus://user:password@example.com?profile=a&profile=b&port=2999&protocol=TCP")
    ).toThrow("profile 不能重复");
    expect(() => parseMierus("mierus://user:password@example.com?profile=a&port=2999")).toThrow(
      "port 与 protocol 参数必须成对出现"
    );
    expect(() =>
      parseMierus("mierus://user:password@example.com?profile=a&port=70000&protocol=TCP")
    ).toThrow("端口超出有效范围");
    expect(() =>
      parseMierus("mierus://user:password@example.com?profile=a&port=2999&protocol=QUIC")
    ).toThrow("只支持 TCP 或 UDP");
  });

  it("validates URI structure and every optional parameter boundary", () => {
    const link = (query: string) => `mierus://user:password@example.com?profile=a&port=2999&protocol=TCP&${query}`;

    expect(() => parseMierus("ss://user:password@example.com")).toThrow("无效的 Mieru");
    expect(() => parseMierus("mierus://user:password@example.com:2999?profile=a&port=2999&protocol=TCP")).toThrow("port 参数");
    expect(() => parseMierus("mierus://user:password@example.com/path?profile=a&port=2999&protocol=TCP")).toThrow("port 参数");
    expect(() => parseMierus("mierus://example.com?profile=a&port=2999&protocol=TCP")).toThrow("缺少用户名");
    expect(() => parseMierus("mierus://user:password@example.com?port=2999&protocol=TCP")).toThrow("缺少 profile");

    for (const mtu of ["bad", "1279", "1501"]) {
      expect(() => parseMierus(link(`mtu=${mtu}`))).toThrow("mtu 必须在 1280 到 1500 之间");
    }
    expect(() => parseMierus(link("multiplexing=invalid"))).toThrow("multiplexing 参数无效");
    expect(() => parseMierus(link("handshake-mode=invalid"))).toThrow("handshake-mode 参数无效");
    expect(() => parseMierus(link("traffic-pattern=not_base64"))).toThrow("traffic-pattern");

    for (const port of ["x-y", "0-1", "2-65536", "3000-2999"]) {
      expect(() => parseMierus(`mierus://user:password@example.com?profile=a&port=${port}&protocol=TCP`)).toThrow("端口");
    }
  });

  it("uses the profile name for a single binding and limits binding expansion", () => {
    expect(parseMierus("mierus://user:password@example.com?profile=Solo&port=2999&protocol=UDP")).toEqual([
      expect.objectContaining({ name: "Solo", port: 2999, transport: "UDP" }),
    ]);

    const params = new URLSearchParams({ profile: "many" });
    for (let index = 0; index < 257; index += 1) {
      params.append("port", String(1000 + index));
      params.append("protocol", "TCP");
    }
    expect(() => parseMierus(`mierus://user:password@example.com?${params}`)).toThrow("绑定数量过多");
  });
});
