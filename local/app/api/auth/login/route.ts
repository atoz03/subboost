import { NextResponse } from "next/server";
import { apiError, getStringField, jsonBodyError, LOCAL_JSON_BODY_LIMITS, readJsonBody } from "@local/lib/http";
import { verifyLocalUser } from "@local/lib/local-user-service";
import {
  createSession,
  csrfCookieOptions,
  sessionCookieOptions,
  CSRF_COOKIE,
  SESSION_COOKIE,
} from "@local/lib/session";
import {
  consumeLocalRateLimit,
  getTrustedClientRateLimitKey,
  hashLocalRateLimitKey,
  localRateLimitResponse,
  resetLocalRateLimit,
} from "@local/lib/rate-limit";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  const clientKey = getTrustedClientRateLimitKey(request);
  if (clientKey) {
    const clientLimit = consumeLocalRateLimit("auth-login-client", clientKey, {
      limit: 30,
      windowMs: LOGIN_WINDOW_MS,
    });
    if (!clientLimit.allowed) {
      return localRateLimitResponse("Too many login attempts. Try again later.", clientLimit.retryAfterSeconds);
    }
  }

  const parsedBody = await readJsonBody(request, LOCAL_JSON_BODY_LIMITS.small);
  if (!parsedBody.ok) return jsonBodyError(parsedBody);
  const body = parsedBody.value;

  const username = getStringField(body, "username");
  const password = getStringField(body, "password");
  const usernameLimitKey = hashLocalRateLimitKey(username.toLowerCase() || "missing");
  const usernameLimit = consumeLocalRateLimit("auth-login-username", usernameLimitKey, {
    limit: 8,
    windowMs: LOGIN_WINDOW_MS,
  });
  if (!usernameLimit.allowed) {
    return localRateLimitResponse("Too many login attempts. Try again later.", usernameLimit.retryAfterSeconds);
  }
  const user = await verifyLocalUser(username, password);
  if (!user) {
    return apiError("Invalid username or password.", "UNAUTHORIZED", 401);
  }

  resetLocalRateLimit("auth-login-username", usernameLimitKey);

  const session = await createSession({ userId: user.id, username: user.username });
  const response = NextResponse.json({ success: true, user, csrfToken: session.csrfToken });
  response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions());
  response.cookies.set(CSRF_COOKIE, session.csrfToken, csrfCookieOptions());
  return response;
}
