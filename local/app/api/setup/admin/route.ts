import { NextResponse } from "next/server";
import { LOCAL_ADMIN_CREDENTIAL_MESSAGES } from "@local/lib/admin-credentials";
import { apiError, jsonBodyError, LOCAL_JSON_BODY_LIMITS, readJsonBody } from "@local/lib/http";
import { createInitialAdmin } from "@local/lib/local-user-service";
import {
  createSession,
  csrfCookieOptions,
  sessionCookieOptions,
  CSRF_COOKIE,
  SESSION_COOKIE,
} from "@local/lib/session";
import { consumeLocalRateLimit, getTrustedClientRateLimitKey, localRateLimitResponse } from "@local/lib/rate-limit";
import { validateLocalSetupToken } from "@local/lib/setup-token";

export async function POST(request: Request) {
  const clientKey = getTrustedClientRateLimitKey(request);
  if (clientKey) {
    const setupLimit = consumeLocalRateLimit("admin-setup-client", clientKey, {
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });
    if (!setupLimit.allowed) {
      return localRateLimitResponse("Too many setup attempts. Try again later.", setupLimit.retryAfterSeconds);
    }
  }

  const setupToken = validateLocalSetupToken(request);
  if (setupToken === "missing_config") {
    return apiError("LOCAL_SETUP_TOKEN is not configured.", "CONFIGURATION_ERROR", 503);
  }
  if (setupToken === "invalid") {
    return apiError("Invalid setup token.", "FORBIDDEN", 403);
  }

  const parsedBody = await readJsonBody(request, LOCAL_JSON_BODY_LIMITS.small);
  if (!parsedBody.ok) return jsonBodyError(parsedBody, LOCAL_ADMIN_CREDENTIAL_MESSAGES.invalidJson);
  const body = parsedBody.value;

  try {
    const user = await createInitialAdmin(body);
    const session = await createSession({ userId: user.id, username: user.username });
    const response = NextResponse.json({ success: true, user, csrfToken: session.csrfToken });
    response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions());
    response.cookies.set(CSRF_COOKIE, session.csrfToken, csrfCookieOptions());
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create administrator.";
    const status = message === "系统已初始化，请直接登录。" ? 409 : 400;
    const code = status === 409 ? "CONFLICT" : "BAD_REQUEST";
    return apiError(message, code, status);
  }
}
