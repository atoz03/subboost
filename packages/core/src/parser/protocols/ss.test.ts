import { describe, expect, it } from "vitest";
import { parseSS, normalizeSsPlugin } from "./ss";

function b64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

describe("parseSS", () => {
  it("parses base64 payload and SIP002 links with plugin aliases", () => {
    const full = parseSS(`ss://${b64("aes-128-gcm:secret@ss.example.com:8388")}#Full`);
    const sip002 = parseSS(
      `ss://aes-256-gcm:pass@[2001:db8::1]:8388?plugin=${encodeURIComponent("v2ray-plugin;mode=websocket;mux=1;tls=0")}&uot=1&tfo=yes#IPv6`
    );

    expect(full).toMatchObject({
      name: "Full",
      type: "ss",
      server: "ss.example.com",
      port: 8388,
      cipher: "aes-128-gcm",
      password: "secret",
      udp: true,
    });
    expect(sip002).toMatchObject({
      name: "IPv6",
      server: "2001:db8::1",
      plugin: "v2ray-plugin",
      "plugin-opts": {
        mode: "websocket",
        mux: true,
        tls: false,
      },
      "udp-over-tcp": true,
      tfo: true,
    });
  });

  it("accepts v2ray-plugin JSON parameters when plugin is omitted", () => {
    const params = b64(JSON.stringify({ mode: "websocket", host: "cdn.example.com", mux: "0" }));
    const node = parseSS(
      `ss://${b64("aes-128-gcm:secret")}@ss-json.example.com:8388?v2ray-plugin=${encodeURIComponent(params)}#JSON`
    );

    expect(node).toMatchObject({
      name: "JSON",
      plugin: "v2ray-plugin",
      "plugin-opts": {
        mode: "websocket",
        host: "cdn.example.com",
        mux: false,
      },
    });
  });

  it("parses empty bool query flags and ignores invalid v2ray-plugin JSON", () => {
    const boolFlags = parseSS("ss://aes-128-gcm:secret@bool.example.com:8388?uot=&tfo=#Bool");
    const invalidJson = parseSS(
      `ss://aes-128-gcm:secret@plain.example.com:8388?v2ray-plugin=${encodeURIComponent("not-json")}#Plain`
    );

    expect(boolFlags).toMatchObject({
      name: "Bool",
      server: "bool.example.com",
      "udp-over-tcp": true,
      tfo: true,
    });
    expect(invalidJson).toMatchObject({
      name: "Plain",
      server: "plain.example.com",
    });
    expect(invalidJson).not.toHaveProperty("plugin");
  });

  it("normalizes plugin names and rejects malformed links", () => {
    expect(normalizeSsPlugin(undefined, undefined)).toEqual({
      plugin: undefined,
      pluginOpts: undefined,
    });
    expect(normalizeSsPlugin("obfs", undefined)).toEqual({
      plugin: "obfs",
      pluginOpts: undefined,
    });
    expect(normalizeSsPlugin("v2ray-plugin", undefined)).toEqual({
      plugin: "v2ray-plugin",
      pluginOpts: undefined,
    });
    expect(normalizeSsPlugin("obfs-local", { obfs: "http", "obfs-host": "cdn.example.com" })).toEqual({
      plugin: "obfs",
      pluginOpts: { mode: "http", host: "cdn.example.com" },
    });
    expect(normalizeSsPlugin("gost-plugin", { tls: "yes", mux: 0, extra: "keep" })).toEqual({
      plugin: "gost-plugin",
      pluginOpts: { tls: true, mux: false, extra: "keep" },
    });
    expect(normalizeSsPlugin("xray-plugin", { tls: "off", mux: "maybe" })).toEqual({
      plugin: "xray-plugin",
      pluginOpts: { tls: false, mux: "maybe" },
    });
    expect(normalizeSsPlugin("simple-obfs", { mode: "", host: "" })).toEqual({
      plugin: "obfs",
      pluginOpts: undefined,
    });
    expect(normalizeSsPlugin("custom-plugin", { mode: "raw" })).toEqual({
      plugin: "custom-plugin",
      pluginOpts: { mode: "raw" },
    });

    expect(
      parseSS(
        `ss://${b64("aes-128-gcm:secret")}@escaped.example.com:8388?plugin=${encodeURIComponent(
          String.raw`obfs-local;obfs=tls;obfs-host=cdn\;edge.example.com;flag;empty=`
        )}&uot=0&tfo=on#Escaped`
      )
    ).toMatchObject({
      name: "Escaped",
      plugin: "obfs",
      "plugin-opts": {
        mode: "tls",
        host: "cdn;edge.example.com",
      },
      tfo: true,
    });

    expect(() => parseSS("http://bad")).toThrow("无效的 SS 链接");
    expect(() => parseSS(`ss://${b64("aes-128-gcm:secret@ss.example.com")}`)).toThrow("无法解析服务器端口");
    expect(() => parseSS(`ss://${b64("bad@ss.example.com:8388")}`)).toThrow("无法解析加密方式和密码");
    expect(() => parseSS(`ss://${b64("bad")}@outer.example.com:8388`)).toThrow(
      "无法解析加密方式和密码"
    );
    expect(() => parseSS("ss://not-base64")).toThrow("无效的 SS 链接格式");
    expect(() => parseSS(`ss://${b64("aes-128-gcm:secret@ss.example.com:70000")}`)).toThrow("无效的端口号");
  });
});
