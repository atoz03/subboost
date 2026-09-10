/**
 * Mieru 官方简单分享链接解析器。
 *
 * 格式：mierus://username:password@server?profile=name&port=2999&protocol=TCP
 * `port` 与 `protocol` 可以成对重复；每个绑定会转换为一个 Mihomo mieru 节点。
 */

import { isStandardBase64String } from "@subboost/core/mihomo/ech";
import type { MieruNode } from "@subboost/core/types/node";
import { parseUrlWithNeutralScheme, safeDecodeFormUrlEncoded, safeDecodeURIComponent } from "./url-decode";

const MULTIPLEXING_LEVELS = new Set([
  "MULTIPLEXING_OFF",
  "MULTIPLEXING_LOW",
  "MULTIPLEXING_MIDDLE",
  "MULTIPLEXING_HIGH",
]);
const HANDSHAKE_MODES = new Set(["HANDSHAKE_STANDARD", "HANDSHAKE_NO_WAIT"]);
const MAX_PORT_BINDINGS = 256;

type PortBinding =
  | { port: number; label: string }
  | { port: number; portRange: string; label: string };

function readSingletonParam(params: URLSearchParams, key: string, required = false): string | undefined {
  const values = params.getAll(key);
  if (values.length > 1) throw new Error(`Mieru 参数 ${key} 不能重复`);
  const value = values[0]?.trim();
  if (required && !value) throw new Error(`Mieru 配置缺少 ${key}`);
  return value || undefined;
}

function parsePortBinding(value: string): PortBinding {
  const raw = value.trim();
  if (/^\d+$/.test(raw)) {
    const port = Number.parseInt(raw, 10);
    if (port >= 1 && port <= 65535) return { port, label: raw };
    throw new Error("Mieru 端口超出有效范围");
  }

  const range = /^(\d+)-(\d+)$/.exec(raw);
  if (!range) throw new Error("Mieru 端口或端口范围无效");
  const start = Number.parseInt(range[1], 10);
  const end = Number.parseInt(range[2], 10);
  if (start < 1 || end > 65535 || start > end) {
    throw new Error("Mieru 端口范围无效");
  }
  return { port: start, portRange: `${start}-${end}`, label: `${start}-${end}` };
}

function normalizeTrafficPattern(value: string | undefined): string | undefined {
  if (!value) return undefined;
  // URLSearchParams 按表单语义把未转义的 “+” 解码为空格；官方字段是标准 Base64。
  const normalized = value.replace(/ /g, "+").trim();
  if (!isStandardBase64String(normalized)) throw new Error("Mieru traffic-pattern 不是有效的 Base64");
  return normalized;
}

export function parseMierus(uri: string): MieruNode[] {
  if (!uri.startsWith("mierus://")) throw new Error("无效的 Mieru 简单分享链接");

  const url = parseUrlWithNeutralScheme(uri);
  if (url.port || (url.pathname && url.pathname !== "/")) {
    throw new Error("Mieru 端口必须通过 port 参数提供");
  }

  const username = safeDecodeURIComponent(url.username).trim();
  const password = safeDecodeURIComponent(url.password);
  const server = url.hostname.trim();
  if (!username || !password || !server) throw new Error("Mieru 配置缺少用户名、密码或服务器地址");

  const params = url.searchParams;
  const profile = safeDecodeFormUrlEncoded(readSingletonParam(params, "profile", true)!);
  const mtu = readSingletonParam(params, "mtu");
  if (mtu && (!/^\d+$/.test(mtu) || Number.parseInt(mtu, 10) < 1280 || Number.parseInt(mtu, 10) > 1500)) {
    throw new Error("Mieru mtu 必须在 1280 到 1500 之间");
  }

  const multiplexing = readSingletonParam(params, "multiplexing")?.toUpperCase();
  if (multiplexing && !MULTIPLEXING_LEVELS.has(multiplexing)) {
    throw new Error("Mieru multiplexing 参数无效");
  }
  const handshakeMode = readSingletonParam(params, "handshake-mode")?.toUpperCase();
  if (handshakeMode && !HANDSHAKE_MODES.has(handshakeMode)) {
    throw new Error("Mieru handshake-mode 参数无效");
  }
  const trafficPattern = normalizeTrafficPattern(readSingletonParam(params, "traffic-pattern"));

  const ports = params.getAll("port");
  const protocols = params.getAll("protocol");
  if (ports.length === 0 || ports.length !== protocols.length) {
    throw new Error("Mieru port 与 protocol 参数必须成对出现");
  }
  if (ports.length > MAX_PORT_BINDINGS) throw new Error("Mieru 端口绑定数量过多");

  const fragmentName = safeDecodeFormUrlEncoded(url.hash.replace(/^#/, "")).trim();
  const baseName = fragmentName || profile;
  const includeBindingInName = ports.length > 1;

  return ports.map((rawPort, index) => {
    const binding = parsePortBinding(rawPort);
    const transport = protocols[index]?.trim().toUpperCase();
    if (transport !== "TCP" && transport !== "UDP") throw new Error("Mieru protocol 只支持 TCP 或 UDP");

    const node: MieruNode = {
      name: includeBindingInName ? `${baseName} [${transport} ${binding.label}]` : baseName,
      type: "mieru",
      server,
      port: binding.port,
      username,
      password,
      transport,
      udp: true,
    };
    if ("portRange" in binding) node["port-range"] = binding.portRange;
    if (multiplexing) node.multiplexing = multiplexing;
    if (handshakeMode) node["handshake-mode"] = handshakeMode;
    if (trafficPattern) node["traffic-pattern"] = trafficPattern;
    return node;
  });
}
