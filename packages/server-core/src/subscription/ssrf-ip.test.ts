import { describe, expect, it } from "vitest";
import { isPrivateOrReservedIp } from "./ssrf-ip";

describe("SSRF IP classification", () => {
  it("marks private, reserved, and documentation IPv4 ranges as unsafe", () => {
    for (const ip of [
      "0.0.0.1",
      "10.0.0.1",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.1.1",
      "172.16.0.1",
      "192.0.2.1",
      "192.168.1.1",
      "198.18.0.1",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
      "240.0.0.1",
    ]) {
      expect(isPrivateOrReservedIp(ip), ip).toBe(true);
    }
    expect(isPrivateOrReservedIp("8.8.8.8")).toBe(false);
    expect(isPrivateOrReservedIp("198.51.101.1")).toBe(false);
    expect(isPrivateOrReservedIp("example.test")).toBe(false);
  });

  it("marks private, reserved, documentation, and IPv4-mapped IPv6 as unsafe", () => {
    for (const ip of [
      "::",
      "0:0:0:0:0:0:0:0",
      "::1",
      "fc00::1",
      "fd00::1",
      "fe80::1",
      "febf::1",
      "ff00::1",
      "2001:db8::1",
      "2001:0db8::1",
      "::ffff:127.0.0.1",
      "::ffff:c0a8:1",
    ]) {
      expect(isPrivateOrReservedIp(ip), ip).toBe(true);
    }
    expect(isPrivateOrReservedIp("2606:4700:4700::1111")).toBe(false);
    expect(isPrivateOrReservedIp("2001:db80::1")).toBe(false);
    expect(isPrivateOrReservedIp("::ffff:8.8.8.8")).toBe(false);
    expect(isPrivateOrReservedIp("::ffff:808:808")).toBe(false);
  });
});
