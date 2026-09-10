import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readJsonBody: vi.fn(),
  jsonBodyError: vi.fn((result: { reason: string }, message: string) =>
    new Response(
      JSON.stringify({
        error: result.reason === "too_large" ? "Request body is too large." : message,
        code: result.reason === "too_large" ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST",
      }),
      { status: result.reason === "too_large" ? 413 : 400 }
    )
  ),
  apiError: vi.fn((message: string, code: string, status: number) =>
    new Response(JSON.stringify({ error: message, code }), { status })
  ),
  createInitialAdmin: vi.fn(),
  createSession: vi.fn(),
  sessionCookieOptions: vi.fn(() => ({ httpOnly: true, path: "/" })),
  csrfCookieOptions: vi.fn(() => ({ path: "/" })),
  consumeLocalRateLimit: vi.fn(),
  getTrustedClientRateLimitKey: vi.fn(),
  localRateLimitResponse: vi.fn((message: string, retryAfterSeconds: number) =>
    new Response(JSON.stringify({ error: message, code: "RATE_LIMITED" }), {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    })
  ),
}));

vi.mock("@local/lib/http", () => ({
  apiError: mocks.apiError,
  jsonBodyError: mocks.jsonBodyError,
  LOCAL_JSON_BODY_LIMITS: { small: 64 * 1024 },
  readJsonBody: mocks.readJsonBody,
}));

vi.mock("@local/lib/local-user-service", () => ({
  createInitialAdmin: mocks.createInitialAdmin,
}));

vi.mock("@local/lib/session", () => ({
  createSession: mocks.createSession,
  sessionCookieOptions: mocks.sessionCookieOptions,
  csrfCookieOptions: mocks.csrfCookieOptions,
  SESSION_COOKIE: "subboost_local_session",
  CSRF_COOKIE: "subboost_local_csrf",
}));

vi.mock("@local/lib/rate-limit", () => ({
  consumeLocalRateLimit: mocks.consumeLocalRateLimit,
  getTrustedClientRateLimitKey: mocks.getTrustedClientRateLimitKey,
  localRateLimitResponse: mocks.localRateLimitResponse,
}));

import { POST } from "./route";

function setupRequest(token = "setup-secret") {
  return new Request("https://local.test/api/setup/admin", {
    method: "POST",
    headers: { "X-SubBoost-Setup-Token": token },
  });
}

async function readJson(response: Response) {
  return { status: response.status, body: await response.json(), headers: response.headers };
}

describe("local setup admin route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LOCAL_SETUP_TOKEN = "setup-secret";
    mocks.createInitialAdmin.mockResolvedValue({ id: "admin-1", username: "ry" });
    mocks.createSession.mockResolvedValue({ token: "session-token", csrfToken: "csrf-token" });
    mocks.getTrustedClientRateLimitKey.mockReturnValue(null);
    mocks.consumeLocalRateLimit.mockReturnValue({ allowed: true, retryAfterSeconds: 0 });
  });

  it("rejects invalid JSON and surfaces service errors", async () => {
    mocks.readJsonBody.mockResolvedValueOnce({ ok: false, reason: "invalid_json" });
    expect(await readJson(await POST(setupRequest()))).toMatchObject({
      status: 400,
      body: { error: "请求格式有误，请刷新页面后重试", code: "BAD_REQUEST" },
    });

    mocks.readJsonBody.mockResolvedValueOnce({
      ok: true,
      value: { username: "ry", password: "bad", passwordConfirm: "bad" },
    });
    mocks.createInitialAdmin.mockRejectedValueOnce(new Error("系统已初始化，请直接登录。"));
    expect(await readJson(await POST(setupRequest()))).toMatchObject({
      status: 409,
      body: { error: "系统已初始化，请直接登录。", code: "CONFLICT" },
    });

    mocks.readJsonBody.mockResolvedValueOnce({
      ok: true,
      value: { username: "ry", password: "bad", passwordConfirm: "bad" },
    });
    mocks.createInitialAdmin.mockRejectedValueOnce(new Error("密码长度至少为 12 位。"));
    expect(await readJson(await POST(setupRequest()))).toMatchObject({
      status: 400,
      body: { error: "密码长度至少为 12 位。", code: "BAD_REQUEST" },
    });
  });

  it("creates the first local admin and sets session and CSRF cookies", async () => {
    const value = {
      username: " ry ",
      password: "very-secret-password",
      passwordConfirm: "very-secret-password",
    };
    mocks.readJsonBody.mockResolvedValue({ ok: true, value });

    const result = await readJson(await POST(setupRequest()));

    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      success: true,
      user: { id: "admin-1", username: "ry" },
      csrfToken: "csrf-token",
    });
    expect(mocks.createInitialAdmin).toHaveBeenCalledWith(value);
    expect(mocks.createSession).toHaveBeenCalledWith({ userId: "admin-1", username: "ry" });
    expect(result.headers.get("set-cookie")).toContain("subboost_local_session=session-token");
    expect(result.headers.get("set-cookie")).toContain("subboost_local_csrf=csrf-token");
  });

  it("fails closed when the setup token is missing or invalid", async () => {
    expect(await readJson(await POST(setupRequest("wrong")))).toMatchObject({
      status: 403,
      body: { code: "FORBIDDEN" },
    });

    delete process.env.LOCAL_SETUP_TOKEN;
    expect(await readJson(await POST(setupRequest()))).toMatchObject({
      status: 503,
      body: { code: "CONFIGURATION_ERROR" },
    });
    expect(mocks.readJsonBody).not.toHaveBeenCalled();
  });

  it("applies trusted-client setup limits and handles non-Error failures", async () => {
    mocks.getTrustedClientRateLimitKey.mockReturnValue("client-key");
    mocks.consumeLocalRateLimit.mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    expect(await readJson(await POST(setupRequest()))).toMatchObject({
      status: 429,
      body: { code: "RATE_LIMITED" },
    });
    expect(mocks.readJsonBody).not.toHaveBeenCalled();

    mocks.consumeLocalRateLimit.mockReturnValueOnce({ allowed: true, retryAfterSeconds: 0 });
    mocks.readJsonBody.mockResolvedValueOnce({ ok: true, value: {} });
    mocks.createInitialAdmin.mockRejectedValueOnce("unknown");
    expect(await readJson(await POST(setupRequest()))).toMatchObject({
      status: 400,
      body: { error: "Unable to create administrator.", code: "BAD_REQUEST" },
    });
  });
});
