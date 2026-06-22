import type { ConfigState, SourceType, SubscriptionSource } from "./definitions";
import { initialState } from "./definitions";
import { safeParseJsonObject } from "@subboost/core/json";
import { normalizeRuleModelFromConfig } from "@subboost/core/rules/rule-model";
import { migrateFilteredProxyGroupsConfig } from "@subboost/core/migrations/filtered-proxy-groups";

export const AUTH_CONFIG_HANDOFF_STORAGE_NAME = "subboost-auth-config-handoff";

const AUTH_CONFIG_HANDOFF_VERSION = 1;
const AUTH_CONFIG_HANDOFF_TTL_MS = 10 * 60 * 1000;

type AuthConfigHandoffStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type AuthConfigHandoffEnvelope = {
  version: number;
  createdAt: number;
  state: unknown;
};

function getSessionStorage(): AuthConfigHandoffStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string");
}

function recordObject(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function objectArray<T>(value: unknown): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter(isRecord);
  return items.length === value.length ? (items as unknown as T[]) : undefined;
}

function validSourceType(value: unknown): value is SourceType {
  return value === "url" || value === "yaml" || value === "nodes";
}

function sourceArray(value: unknown): SubscriptionSource[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const sources: SubscriptionSource[] = [];
  for (const item of value) {
    if (!isRecord(item)) return undefined;
    if (typeof item.id !== "string" || !validSourceType(item.type) || typeof item.content !== "string") {
      return undefined;
    }
    const subscriptionUserInfo = recordObject(item.subscriptionUserInfo);
    sources.push({
      id: item.id,
      type: item.type,
      content: item.content,
      ...(typeof item.name === "string" ? { name: item.name } : {}),
      ...(typeof item.lastParsedContent === "string" ? { lastParsedContent: item.lastParsedContent } : {}),
      ...(typeof item.lastParsedTag === "string" ? { lastParsedTag: item.lastParsedTag } : {}),
      ...(typeof item.lastParsedNameTemplate === "string" ? { lastParsedNameTemplate: item.lastParsedNameTemplate } : {}),
      ...(typeof item.tag === "string" ? { tag: item.tag } : {}),
      ...(typeof item.nameTemplate === "string" ? { nameTemplate: item.nameTemplate } : {}),
      ...(typeof item.useProxyProviders === "boolean" ? { useProxyProviders: item.useProxyProviders } : {}),
      ...(typeof item.userinfoUrl === "string" ? { userinfoUrl: item.userinfoUrl } : {}),
      ...(typeof item.userinfoUserAgent === "string" ? { userinfoUserAgent: item.userinfoUserAgent } : {}),
      ...(typeof item.parsed === "boolean" ? { parsed: item.parsed } : {}),
      ...(typeof item.nodeCount === "number" && Number.isFinite(item.nodeCount) ? { nodeCount: item.nodeCount } : {}),
      ...(subscriptionUserInfo
        ? { subscriptionUserInfo: subscriptionUserInfo as SubscriptionSource["subscriptionUserInfo"] }
        : {}),
    });
  }
  return sources;
}

function numberRecord(value: unknown): Record<string, number> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
    out[key] = raw;
  }
  return out;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) return false;
  return Object.values(value).every((item) => typeof item === "string");
}

function hasRecordEntries(value: Record<string, unknown> | undefined): boolean {
  return Boolean(value && Object.keys(value).length > 0);
}

function sameStringArray(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}

function hasMeaningfulConfig(state: ConfigState): boolean {
  return (
    state.sources.some((source) => source.content.trim()) ||
    state.nodes.length > 0 ||
    state.deletedNodeNames.length > 0 ||
    state.deletedNodes.length > 0 ||
    state.customRules.length > 0 ||
    state.customRuleSets.length > 0 ||
    state.customProxyGroups.length > 0 ||
    hasRecordEntries(state.proxyGroupAdvanced as Record<string, unknown>) ||
    hasRecordEntries(state.builtinRuleEdits as Record<string, unknown>) ||
    state.dialerProxyGroups.length > 0 ||
    hasRecordEntries(state.proxyGroupNameOverrides) ||
    state.proxyGroupOrder.length > 0 ||
    state.ruleOrder.length > 0 ||
    state.moduleRuleEditWarningAccepted !== initialState.moduleRuleEditWarningAccepted ||
    state.appliedTemplateId !== initialState.appliedTemplateId ||
    state.template !== initialState.template ||
    !sameStringArray(state.enabledProxyGroups, initialState.enabledProxyGroups) ||
    state.hiddenProxyGroups.length > 0 ||
    state.dnsYaml !== initialState.dnsYaml ||
    state.mixedPort !== initialState.mixedPort ||
    state.allowLan !== initialState.allowLan ||
    state.testUrl !== initialState.testUrl ||
    state.testInterval !== initialState.testInterval ||
    state.ruleProviderBaseUrl !== initialState.ruleProviderBaseUrl ||
    state.cnIpNoResolve !== initialState.cnIpNoResolve ||
    state.experimentalCnUseCnRuleSet !== initialState.experimentalCnUseCnRuleSet ||
    Object.keys(state.listenerPorts).length > 0
  );
}

function buildHandoffState(state: ConfigState): Partial<ConfigState> {
  return {
    sources: sourceArray(state.sources) ?? [],
    nodes: state.nodes,
    deletedNodeNames: state.deletedNodeNames,
    deletedNodes: state.deletedNodes,
    template: state.template,
    enabledProxyGroups: state.enabledProxyGroups,
    hiddenProxyGroups: state.hiddenProxyGroups,
    customProxyGroups: state.customProxyGroups,
    proxyGroupAdvanced: state.proxyGroupAdvanced,
    customRuleSets: state.customRuleSets,
    builtinRuleEdits: state.builtinRuleEdits,
    customRules: state.customRules,
    dialerProxyGroups: state.dialerProxyGroups,
    proxyGroupNameOverrides: state.proxyGroupNameOverrides,
    proxyGroupOrder: state.proxyGroupOrder,
    ruleOrder: state.ruleOrder,
    moduleRuleEditWarningAccepted: state.moduleRuleEditWarningAccepted,
    appliedTemplateId: state.appliedTemplateId,
    dnsYaml: state.dnsYaml,
    mixedPort: state.mixedPort,
    allowLan: state.allowLan,
    testUrl: state.testUrl,
    testInterval: state.testInterval,
    ruleProviderBaseUrl: state.ruleProviderBaseUrl,
    cnIpNoResolve: state.cnIpNoResolve,
    experimentalCnUseCnRuleSet: state.experimentalCnUseCnRuleSet,
    listenerPorts: state.listenerPorts,
  };
}

function normalizeHandoffState(raw: unknown): Partial<ConfigState> | null {
  const migratedRaw = migrateFilteredProxyGroupsConfig(raw);
  if (!isRecord(migratedRaw)) return null;
  const out: Partial<ConfigState> = {};

  const sources = sourceArray(migratedRaw.sources);
  if (sources) out.sources = sources;
  const nodes = objectArray<ConfigState["nodes"][number]>(migratedRaw.nodes);
  if (nodes) out.nodes = nodes;
  const deletedNodeNames = stringArray(migratedRaw.deletedNodeNames);
  if (deletedNodeNames) out.deletedNodeNames = deletedNodeNames;
  const deletedNodes = objectArray<ConfigState["deletedNodes"][number]>(migratedRaw.deletedNodes);
  if (deletedNodes) out.deletedNodes = deletedNodes;
  if (migratedRaw.template === "minimal" || migratedRaw.template === "standard" || migratedRaw.template === "full") out.template = migratedRaw.template;
  const enabledProxyGroups = stringArray(migratedRaw.enabledProxyGroups);
  if (enabledProxyGroups) out.enabledProxyGroups = enabledProxyGroups;
  const hiddenProxyGroups = stringArray(migratedRaw.hiddenProxyGroups);
  if (hiddenProxyGroups) out.hiddenProxyGroups = hiddenProxyGroups;
  const ruleModel = normalizeRuleModelFromConfig(migratedRaw);
  const customProxyGroups = objectArray<ConfigState["customProxyGroups"][number]>(migratedRaw.customProxyGroups);
  if (customProxyGroups || ruleModel.customProxyGroups.length > 0) out.customProxyGroups = ruleModel.customProxyGroups;
  if (isRecord(migratedRaw.proxyGroupAdvanced)) {
    out.proxyGroupAdvanced = migratedRaw.proxyGroupAdvanced as ConfigState["proxyGroupAdvanced"];
  }
  if (Array.isArray(migratedRaw.customRuleSets)) {
    out.customRuleSets = ruleModel.customRuleSets;
  }
  if (isRecord(migratedRaw.builtinRuleEdits)) {
    out.builtinRuleEdits = ruleModel.builtinRuleEdits;
  }
  const customRules = objectArray<ConfigState["customRules"][number]>(migratedRaw.customRules);
  if (customRules) out.customRules = customRules;
  const dialerProxyGroups = objectArray<ConfigState["dialerProxyGroups"][number]>(migratedRaw.dialerProxyGroups);
  if (dialerProxyGroups) out.dialerProxyGroups = dialerProxyGroups;
  if (isStringRecord(migratedRaw.proxyGroupNameOverrides)) out.proxyGroupNameOverrides = migratedRaw.proxyGroupNameOverrides;
  const proxyGroupOrder = stringArray(migratedRaw.proxyGroupOrder);
  if (proxyGroupOrder) out.proxyGroupOrder = proxyGroupOrder;
  const ruleOrder = stringArray(migratedRaw.ruleOrder);
  if (ruleOrder) out.ruleOrder = ruleOrder;
  if (typeof migratedRaw.moduleRuleEditWarningAccepted === "boolean") out.moduleRuleEditWarningAccepted = migratedRaw.moduleRuleEditWarningAccepted;
  if (typeof migratedRaw.appliedTemplateId === "string" || migratedRaw.appliedTemplateId === null) {
    out.appliedTemplateId = migratedRaw.appliedTemplateId;
  }
  if (typeof migratedRaw.dnsYaml === "string") out.dnsYaml = migratedRaw.dnsYaml;
  if (typeof migratedRaw.mixedPort === "number" && Number.isFinite(migratedRaw.mixedPort)) out.mixedPort = migratedRaw.mixedPort;
  if (typeof migratedRaw.allowLan === "boolean") out.allowLan = migratedRaw.allowLan;
  if (typeof migratedRaw.testUrl === "string") out.testUrl = migratedRaw.testUrl;
  if (typeof migratedRaw.testInterval === "number" && Number.isFinite(migratedRaw.testInterval)) out.testInterval = migratedRaw.testInterval;
  if (typeof migratedRaw.ruleProviderBaseUrl === "string") out.ruleProviderBaseUrl = migratedRaw.ruleProviderBaseUrl;
  if (typeof migratedRaw.cnIpNoResolve === "boolean") out.cnIpNoResolve = migratedRaw.cnIpNoResolve;
  if (typeof migratedRaw.experimentalCnUseCnRuleSet === "boolean") {
    out.experimentalCnUseCnRuleSet = migratedRaw.experimentalCnUseCnRuleSet;
  }
  const listenerPorts = numberRecord(migratedRaw.listenerPorts);
  if (listenerPorts) out.listenerPorts = listenerPorts;

  return out;
}

function parseEnvelope(raw: string | null): AuthConfigHandoffEnvelope | null {
  if (!raw) return null;
  const envelope = safeParseJsonObject(raw);
  if (!isRecord(envelope)) return null;
  if (envelope.version !== AUTH_CONFIG_HANDOFF_VERSION) return null;
  if (typeof envelope.createdAt !== "number" || !Number.isFinite(envelope.createdAt)) return null;
  return { version: envelope.version, createdAt: envelope.createdAt, state: envelope.state };
}

function readHandoff(storage: AuthConfigHandoffStorage): Partial<ConfigState> | null {
  const envelope = parseEnvelope(storage.getItem(AUTH_CONFIG_HANDOFF_STORAGE_NAME));
  if (!envelope) return null;
  if (Date.now() - envelope.createdAt > AUTH_CONFIG_HANDOFF_TTL_MS) return null;
  return normalizeHandoffState(envelope.state);
}

export function captureAuthConfigHandoff(state: ConfigState): void {
  const storage = getSessionStorage();
  if (!storage) return;
  if (!hasMeaningfulConfig(state)) {
    storage.removeItem(AUTH_CONFIG_HANDOFF_STORAGE_NAME);
    return;
  }

  const envelope: AuthConfigHandoffEnvelope = {
    version: AUTH_CONFIG_HANDOFF_VERSION,
    createdAt: Date.now(),
    state: buildHandoffState(state),
  };
  try {
    storage.setItem(AUTH_CONFIG_HANDOFF_STORAGE_NAME, JSON.stringify(envelope));
  } catch {
    storage.removeItem(AUTH_CONFIG_HANDOFF_STORAGE_NAME);
  }
}

export function consumeAuthConfigHandoff(): Partial<ConfigState> | null {
  const storage = getSessionStorage();
  if (!storage) return null;
  try {
    const state = readHandoff(storage);
    storage.removeItem(AUTH_CONFIG_HANDOFF_STORAGE_NAME);
    return state;
  } catch {
    storage.removeItem(AUTH_CONFIG_HANDOFF_STORAGE_NAME);
    return null;
  }
}

export function hasAuthConfigHandoff(): boolean {
  const storage = getSessionStorage();
  if (!storage) return false;
  try {
    const hasHandoff = Boolean(readHandoff(storage));
    if (!hasHandoff) storage.removeItem(AUTH_CONFIG_HANDOFF_STORAGE_NAME);
    return hasHandoff;
  } catch {
    storage.removeItem(AUTH_CONFIG_HANDOFF_STORAGE_NAME);
    return false;
  }
}
