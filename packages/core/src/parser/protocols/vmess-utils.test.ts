import { describe, expect, it } from "vitest";
import {
  DINGTALK_USER_AGENT,
  hasDingTalkHost,
  looksLikeShadowrocketStyleVmess,
  looksLikeStandardVmessStyle,
  looksLikeUriStyleVmess,
  normalizeHeaderKey,
  normalizeHttpMethod,
  parseBooleanish,
  parseHeaderRecord,
  parseObfsHeaderHost,
  pickQueryParam,
  pickString,
  splitList,
  stripOuterQuotes,
} from "./vmess-utils";

describe("VMess parser utility helpers", () => {
  it("normalizes primitive values and headers", () => {
    expect(DINGTALK_USER_AGENT).toContain("DingTalk");
    expect(hasDingTalkHost(["api.dingtalk.com"])).toBe(true);
    expect(hasDingTalkHost(["example.com"])).toBe(false);
    expect(normalizeHttpMethod("post")).toBe("POST");
    expect(normalizeHttpMethod("bad method")).toBe("GET");
    expect(normalizeHeaderKey(" user-agent ")).toBe("User-Agent");
    expect(parseHeaderRecord({ host: "cdn.example.com", empty: "", n: 1, b: false, list: ["a", "", "b"], bad: {} })).toEqual({
      Host: ["cdn.example.com"],
      n: ["1"],
      b: ["false"],
      list: ["a", "b"],
    });
    expect(parseHeaderRecord([])).toBeUndefined();
    expect(splitList("a, b,,c")).toEqual(["a", "b", "c"]);
    expect(splitList("")).toBeUndefined();
    expect(pickString(" x ")).toBe("x");
    expect(pickString(1)).toBe("");
    expect(parseBooleanish("yes")).toBe(true);
    expect(parseBooleanish("off")).toBe(false);
    expect(parseBooleanish("maybe")).toBeUndefined();
  });

  it("detects VMess link styles and extracts query helpers", () => {
    const shadowrocket = Buffer.from("auto:11111111-1111-4111-8111-111111111111@sr.example.com:443").toString("base64");
    const params = new URLSearchParams("a=&b=value&c=next");

    expect(looksLikeUriStyleVmess("uuid@example.com:443")).toBe(true);
    expect(looksLikeStandardVmessStyle("ws+tls:uuid-0@example.com:443")).toBe(true);
    expect(looksLikeShadowrocketStyleVmess(`${shadowrocket}?obfs=websocket`)).toBe(true);
    expect(looksLikeShadowrocketStyleVmess("not-base64?obfs=websocket")).toBe(false);
    expect(stripOuterQuotes('"quoted"')).toBe("quoted");
    expect(pickQueryParam(params, "a", "b", "c")).toBe("value");
    expect(parseObfsHeaderHost("Host: cdn.example.com, Path: /ws")).toBe("cdn.example.com");
    expect(parseObfsHeaderHost("cdn.example.com")).toBe("cdn.example.com");
  });
});
