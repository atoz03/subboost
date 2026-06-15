import { describe, expect, it } from "vitest";
import { parsePlatformProxyLine } from "./parse-platform-proxy-line";

describe("parsePlatformProxyLine", () => {
  it("parses Surge VMess with WebSocket early data, TLS fingerprint, and port hopping", () => {
    const node = parsePlatformProxyLine(
      "Surge VMess = vmess, vmess.example.com, 443, username=11111111-1111-4111-8111-111111111111, vmess-aead=true, ws=true, ws-path=/ws?ed=2048, ws-headers=Host:cdn.example.com|User-Agent:UA, tls=true, sni=v.example.com, server-cert-fingerprint-sha256=fp, skip-cert-verify=true, udp-relay=true, port-hopping=1000-1002;2000"
    );

    expect(node).toMatchObject({
      name: "Surge VMess",
      type: "vmess",
      server: "vmess.example.com",
      port: 443,
      uuid: "11111111-1111-4111-8111-111111111111",
      cipher: "none",
      alterId: 0,
      tls: true,
      servername: "v.example.com",
      "client-fingerprint": "fp",
      "skip-cert-verify": true,
      udp: true,
      ports: "1000-1002,2000",
      network: "ws",
      "ws-opts": {
        path: "/ws",
        headers: {
          Host: "cdn.example.com",
          "User-Agent": "UA",
        },
        "early-data-header-name": "Sec-WebSocket-Protocol",
        "max-early-data": 2048,
      },
    });
  });

  it("parses Surge WireGuard through its referenced section", () => {
    const sections = new Map<string, string[]>([
      [
        "WireGuard Office",
        [
          "private-key = private",
          "self-ip = 10.0.0.2/32",
          "self-ip-v6 = fd00::2/128",
          "dns-server = 1.1.1.1, 8.8.8.8",
          "mtu = 1280",
          "keepalive = 25",
          'peer = (public-key = public, pre-shared-key = psk, endpoint = "wg.example.com:51820", allowed-ips = "0.0.0.0/0, ::/0", client-id = "1/2/3")',
        ],
      ],
    ]);

    const node = parsePlatformProxyLine("Office WG = wireguard, section-name=Office", { sections });

    expect(node).toMatchObject({
      name: "Office WG",
      type: "wireguard",
      server: "wg.example.com",
      port: 51820,
      ip: "10.0.0.2/32",
      ipv6: "fd00::2/128",
      "private-key": "private",
      "public-key": "public",
      "pre-shared-key": "psk",
      mtu: 1280,
      keepalive: 25,
      reserved: [1, 2, 3],
      "allowed-ips": ["0.0.0.0/0", "::/0"],
      dns: ["1.1.1.1", "8.8.8.8"],
      "remote-dns-resolve": true,
      udp: true,
    });
  });

  it("handles Surge WireGuard section edge cases", () => {
    const ipv6Sections = new Map<string, string[]>([
      [
        " wireguard ipv6 ",
        [
          "",
          "# comment",
          "; comment",
          "private-key = private",
          "bad line",
          'peer = (public-key = public, endpoint = "[2001:db8::1]:51820", client-id = "4/5/6")',
        ],
      ],
    ]);

    expect(parsePlatformProxyLine("IPv6 WG = wireguard, section-name=IPv6", { sections: ipv6Sections })).toMatchObject({
      name: "IPv6 WG",
      type: "wireguard",
      server: "2001:db8::1",
      port: 51820,
      "private-key": "private",
      "public-key": "public",
      reserved: [4, 5, 6],
    });
    expect(() => parsePlatformProxyLine("Missing WG = wireguard, section-name=Missing")).toThrow(
      "未找到 WireGuard section: Missing"
    );
    expect(() =>
      parsePlatformProxyLine("Bad WG = wireguard, section-name=Bad", {
        sections: new Map([["WireGuard Bad", ["peer = (public-key = public)"]]]),
      })
    ).toThrow("WireGuard section Bad 缺少有效 endpoint");
  });

  it("normalizes AnyTLS fields and rejects unsupported platform-only variants", () => {
    expect(
      parsePlatformProxyLine(
        "AnyTLS = anytls, anytls.example.com, 443, password=secret, sni=anytls.example.com, server-cert-fingerprint-sha256=fp, skip-cert-verify=false"
      )
    ).toMatchObject({
      name: "AnyTLS",
      type: "anytls",
      server: "anytls.example.com",
      port: 443,
      password: "secret",
      tls: true,
      sni: "anytls.example.com",
      "client-fingerprint": "fp",
      "skip-cert-verify": false,
    });

    expect(() =>
      parsePlatformProxyLine(
        'AnyTLS WS = anytls, anytls.example.com, 443, "secret", transport=ws'
      )
    ).toThrow("AnyTLS 平台配置不支持");
    expect(() => parsePlatformProxyLine("Blocked = direct")).toThrow(
      "不支持的平台代理类型: direct"
    );
  });

  it("normalizes AnyTLS servername aliases and rejects Reality security", () => {
    expect(
      parsePlatformProxyLine(
        "AnyTLS Servername = anytls, anytls.example.com, 443, password=secret, tls-name=server.example.com"
      )
    ).toMatchObject({
      name: "AnyTLS Servername",
      type: "anytls",
      server: "anytls.example.com",
      port: 443,
    });

    expect(
      parsePlatformProxyLine(
        "AnyTLS Security = anytls, anytls.example.com, 443, password=secret, security=reality"
      )
    ).toMatchObject({
      name: "AnyTLS Security",
      type: "anytls",
      server: "anytls.example.com",
    });
  });

  it("parses Loon WireGuard lines with peer, DNS, and reserved metadata", () => {
    const node = parsePlatformProxyLine(
      'WG = wireguard, interface-ip=10.0.0.2/32, interface-ipv6=fd00::2/128, private-key=private, peers=[{public-key=public, preshared-key=psk, endpoint="wg.example.com:51820", allowed-ips="0.0.0.0/0, ::/0", reserved="[1,2,3]"}], mtu=1280, keepalive=25, dns=1.1.1.1, dnsv6=2606:4700:4700::1111'
    );

    expect(node).toMatchObject({
      name: "WG",
      type: "wireguard",
      server: "wg.example.com",
      port: 51820,
      ip: "10.0.0.2/32",
      ipv6: "fd00::2/128",
      "private-key": "private",
      "public-key": "public",
      "pre-shared-key": "psk",
      mtu: 1280,
      keepalive: 25,
      reserved: [1, 2, 3],
      "allowed-ips": ["0.0.0.0/0", "::/0"],
      dns: ["1.1.1.1", "2606:4700:4700::1111"],
      "remote-dns-resolve": true,
      udp: true,
    });
  });

  it("parses minimal Loon WireGuard peers and ignores incomplete custom lines", () => {
    expect(
      parsePlatformProxyLine(
        'WG Minimal = wireguard, private-key=private, peers=[{public-key=public, endpoint="wg-min.example.com:51820"}]'
      )
    ).toMatchObject({
      name: "WG Minimal",
      type: "wireguard",
      server: "wg-min.example.com",
      port: 51820,
      "public-key": "public",
      udp: true,
    });
    expect(
      parsePlatformProxyLine('WG Endpoint Only = wireguard, peers=[{endpoint="wg-only.example.com:51820"}]')
    ).toMatchObject({
      name: "WG Endpoint Only",
      type: "wireguard",
      server: "wg-only.example.com",
      port: 51820,
      udp: true,
      peers: [{ server: "wg-only.example.com", port: 51820 }],
    });

    expect(() => parsePlatformProxyLine("WG Broken = wireguard, private-key=private")).toThrow(
      "Surge WireGuard 缺少 section-name"
    );
    expect(parsePlatformProxyLine('WG Broken = wireguard, private-key=private, peers=[{public-key=public}]')).toBeNull();
  });

  it("parses Loon VLESS and Hysteria2 options", () => {
    expect(
      parsePlatformProxyLine(
        'Loon VLESS = vless, loon.example.com, 443, "11111111-1111-4111-8111-111111111111", transport=ws, host=cdn.example.com, path=/ws?ed=1024, over-tls=true, tls-name=sni.example.com, tls-cert-sha256=fp, public-key=pub, short-id=abc, fast-open=true, udp=true'
      )
    ).toMatchObject({
      name: "Loon VLESS",
      type: "vless",
      server: "loon.example.com",
      port: 443,
      uuid: "11111111-1111-4111-8111-111111111111",
      tls: true,
      servername: "sni.example.com",
      "client-fingerprint": "fp",
      tfo: true,
      udp: true,
      "reality-opts": {
        "public-key": "pub",
        "short-id": "abc",
      },
      network: "ws",
      "ws-opts": {
        path: "/ws",
        headers: {
          Host: "cdn.example.com",
        },
        "early-data-header-name": "Sec-WebSocket-Protocol",
        "max-early-data": 1024,
      },
    });

    expect(
      parsePlatformProxyLine(
        'Loon HY2 = hysteria2, hy2.example.com, 443, "secret", tls-name=hy2.example.com, tls-cert-sha256=fp, udp=true, fast-open=true, download-bandwidth=100 Mbps, salamander-password=mask, ecn=true'
      )
    ).toMatchObject({
      name: "Loon HY2",
      type: "hysteria2",
      server: "hy2.example.com",
      port: 443,
      password: "secret",
      sni: "hy2.example.com",
      fingerprint: "fp",
      udp: true,
      tfo: true,
      down: "100 Mbps",
      obfs: "salamander",
      "obfs-password": "mask",
      ecn: true,
    });
  });

  it("parses Quantumult X VMess and fallback HTTP lines", () => {
    expect(
      parsePlatformProxyLine(
        "vmess=qx.example.com:443, password=11111111-1111-4111-8111-111111111111, method=none, obfs=wss, obfs-host=cdn.example.com, obfs-uri=/ws, over-tls=true, tls-host=sni.example.com, tls-cert-sha256=fp, tag=QX VMess, aead=false"
      )
    ).toMatchObject({
      name: "QX VMess",
      type: "vmess",
      server: "qx.example.com",
      port: 443,
      uuid: "11111111-1111-4111-8111-111111111111",
      cipher: "none",
      alterId: 1,
      tls: true,
      servername: "sni.example.com",
      "client-fingerprint": "fp",
      network: "ws",
      "ws-opts": {
        path: "/ws",
        headers: {
          Host: "cdn.example.com",
        },
      },
    });

    expect(
      parsePlatformProxyLine(
        "http=http.example.com:8080, username=user, password=pass, over-tls=true, tls-host=http.example.com, tag=QX HTTP"
      )
    ).toMatchObject({
      name: "QX HTTP",
      type: "https",
      server: "http.example.com",
      port: 8080,
      username: "user",
      password: "pass",
      tls: true,
    });
  });

  it("returns null for blank, unrelated, or incomplete platform lines", () => {
    expect(parsePlatformProxyLine("   ")).toBeNull();
    expect(parsePlatformProxyLine("not a platform proxy line")).toBeNull();
    expect(parsePlatformProxyLine("Direct = direct, example.com, 443")).toBeNull();
  });
});
