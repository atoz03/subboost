import { describe, expect, it } from "vitest";
import {
  resolveAutomaticRefreshCompletionDecision,
  resolveAutomaticRefreshUnexpectedFailureCompletion,
  type AutomaticRefreshCompletionPrepared,
  type AutomaticRefreshCompletionTarget,
  type PreparedRefreshCacheResult,
  type SubscriptionAutoUpdateStateFields,
} from "./index";

const target: AutomaticRefreshCompletionTarget = {
  id: "sub-1",
  name: "Main",
  userId: "user-1",
  username: "ry",
  autoUpdateInterval: 3600,
};

const attemptedAt = new Date("2026-06-01T01:00:00.000Z");
const cachedAt = new Date("2026-06-01T01:00:02.000Z");

const currentAutoUpdateState: SubscriptionAutoUpdateStateFields = {
  externalFailureCount: 1,
  failureSourceState: "previous",
  lastFailedAt: null,
  lastAttemptedAt: null,
  disabledAt: null,
  disabledReason: null,
  disabledPreviousInterval: null,
};

function makePrepared(refreshResult: PreparedRefreshCacheResult): AutomaticRefreshCompletionPrepared {
  return {
    requestedHosts: ["example.com"],
    refreshResult,
    failureState: null,
    failureReason: "none",
  };
}

describe("automatic refresh completion helpers", () => {
  it("builds the all-sources-failed outcome and failure state", () => {
    const decision = resolveAutomaticRefreshCompletionDecision({
      target,
      currentAutoUpdateState,
      prepared: makePrepared({ ok: false, reason: "all_sources_failed", nodeCount: 0 }),
      attemptedAt,
      maxNodesPerSubscription: 100,
    });

    expect(decision.kind).toBe("all_sources_failed");
    expect(decision.outcome).toEqual({
      status: "failed",
      requestedHosts: ["example.com"],
      recordHosts: true,
      resultsError: "Subscription sub-1 (ry): No import sources refreshed; previous snapshot preserved",
      failedSubscription: {
        subscriptionId: "sub-1",
        subscriptionName: "Main",
        userId: "user-1",
        username: "ry",
        hosts: ["example.com"],
        error: "No import sources refreshed; previous snapshot preserved",
      },
    });
    if (decision.kind === "all_sources_failed") {
      expect(decision.nextAutoUpdateState.state.lastAttemptedAt).toBe(attemptedAt);
    }
  });

  it("marks empty results as attempted and skipped", () => {
    const decision = resolveAutomaticRefreshCompletionDecision({
      target,
      currentAutoUpdateState,
      prepared: makePrepared({ ok: false, reason: "empty_result", nodeCount: 0 }),
      attemptedAt,
      maxNodesPerSubscription: 100,
    });

    expect(decision.kind).toBe("empty_result");
    if (decision.kind === "empty_result") {
      expect(decision.attemptedState).toEqual({ ...currentAutoUpdateState, lastAttemptedAt: attemptedAt });
    }
    expect(decision.outcome).toEqual({
      status: "skipped",
      requestedHosts: ["example.com"],
      recordHosts: false,
    });
  });

  it("marks node quota failures as attempted without host recording", () => {
    const decision = resolveAutomaticRefreshCompletionDecision({
      target,
      currentAutoUpdateState,
      prepared: makePrepared({
        ok: false,
        reason: "node_quota_exceeded",
        nodeCount: 101,
        maxNodesPerSubscription: 100,
      }),
      attemptedAt,
      maxNodesPerSubscription: 100,
    });

    expect(decision.kind).toBe("node_quota_exceeded");
    expect(decision.outcome).toEqual({
      status: "failed",
      requestedHosts: ["example.com"],
      recordHosts: false,
      resultsError: "Subscription sub-1: Node quota exceeded (100)",
    });
  });

  it("uses the cache timestamp for successful attempts", () => {
    const decision = resolveAutomaticRefreshCompletionDecision({
      target,
      currentAutoUpdateState,
      prepared: makePrepared({
        ok: true,
        cacheEntry: { nodes: [], subscriptionInfo: {}, generatedYaml: "yaml" },
        generatedYaml: "yaml",
        nodeCount: 3,
      }),
      attemptedAt,
      successAttemptedAt: cachedAt,
      maxNodesPerSubscription: 100,
    });

    expect(decision.kind).toBe("success");
    if (decision.kind === "success") {
      expect(decision.nextAutoUpdateState.state.lastAttemptedAt).toBe(cachedAt);
    }
    expect(decision.outcome).toEqual({
      status: "updated",
      requestedHosts: ["example.com"],
      recordHosts: true,
      updatedSubscription: {
        subscriptionId: "sub-1",
        subscriptionName: "Main",
        userId: "user-1",
        username: "ry",
        hosts: ["example.com"],
        nodeCount: 3,
      },
    });
  });

  it("builds unexpected failure attempts best-effort", () => {
    const completion = resolveAutomaticRefreshUnexpectedFailureCompletion({
      target,
      requestedHosts: ["example.com"],
      error: new Error("boom"),
      attemptStartedAt: attemptedAt,
    });

    expect(completion.attemptedState?.lastAttemptedAt).toBe(attemptedAt);
    expect(completion.outcome.status).toBe("failed");
    if (completion.outcome.status === "failed") {
      expect(completion.outcome.resultsError).toBe("Subscription sub-1 (ry): boom");
    }
  });
});
