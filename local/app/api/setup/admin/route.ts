import { NextResponse } from "next/server";
import { LOCAL_ADMIN_CREDENTIAL_MESSAGES } from "@local/lib/admin-credentials";
import { apiError, readJsonBody } from "@local/lib/http";
import { createInitialAdmin } from "@local/lib/local-user-service";
import {
  createSession,
  csrfCookieOptions,
  sessionCookieOptions,
  CSRF_COOKIE,
  SESSION_COOKIE,
} from "@local/lib/session";

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body) return apiError(LOCAL_ADMIN_CREDENTIAL_MESSAGES.invalidJson, "BAD_REQUEST", 400);

  try {
    const user = await createInitialAdmin(body);
    const session = await createSession({ userId: user.id, username: user.username });
    const response = NextResponse.json({ success: true, user });
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
