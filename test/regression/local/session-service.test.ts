import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieValues: {} as Record<string, string | undefined>,
  cookies: vi.fn(),
  headerValues: {} as Record<string, string | undefined>,
  headers: vi.fn(),
  isHttpsAppUrl: vi.fn(),
  prisma: {
    localSession: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
  headers: mocks.headers,
}));
vi.mock("@local/lib/env", () => ({ isHttpsAppUrl: mocks.isHttpsAppUrl }));
vi.mock("@local/lib/prisma", () => ({ prisma: mocks.prisma }));

import {
  clearCsrfCookieOptions,
  clearSessionCookieOptions,
  createCsrfToken,
  createSession,
  csrfCookieOptions,
  readCsrfToken,
  readSession,
  revokeAllUserSessions,
  revokeSession,
  rotateSession,
  sessionCookieOptions,
  validateCsrfToken,
} from "../../../local/src/lib/session";

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

describe("local session service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieValues = {};
    mocks.headerValues = {};
    mocks.cookies.mockImplementation(async () => ({
      get: (name: string) => mocks.cookieValues[name] ? { value: mocks.cookieValues[name] } : undefined,
    }));
    mocks.headers.mockImplementation(async () => ({
      get: (name: string) => mocks.headerValues[name] ?? null,
    }));
    mocks.isHttpsAppUrl.mockReturnValue(false);
    mocks.prisma.localSession.create.mockResolvedValue({ id: "session-1" });
    mocks.prisma.localSession.deleteMany.mockResolvedValue({ count: 1 });
    mocks.prisma.localSession.update.mockResolvedValue({});
  });

  it("creates, rotates, and revokes sessions", async () => {
    mocks.headerValues["user-agent"] = `  ${"x".repeat(600)}  `;
    const created = await createSession({ userId: "user-1", username: "alice" });
    expect(created.token).toMatch(/^session-1\.[A-Za-z0-9_-]+$/);
    expect(created.csrfToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(createCsrfToken()).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(mocks.prisma.localSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerId: "user-1",
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        userAgent: "x".repeat(512),
        expiresAt: expect.any(Date),
      }),
      select: { id: true },
    });

    mocks.headerValues["user-agent"] = "   ";
    await createSession({ userId: "user-2", username: "bob" });
    expect(mocks.prisma.localSession.create).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userAgent: null }),
    }));

    await rotateSession("session-1");
    await revokeSession("session-1");
    await revokeAllUserSessions("user-1");
    expect(mocks.prisma.localSession.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "session-1" },
      data: { lastSeenAt: expect.any(Date), expiresAt: expect.any(Date) },
    }));
    expect(mocks.prisma.localSession.deleteMany).toHaveBeenCalledWith({ where: { id: "session-1" } });
    expect(mocks.prisma.localSession.deleteMany).toHaveBeenCalledWith({ where: { ownerId: "user-1" } });
  });

  it("rejects missing, malformed, unknown, expired, and invalid session tokens", async () => {
    await expect(readSession()).resolves.toBeNull();

    for (const token of ["session-only", ".secret", "session."]) {
      mocks.cookieValues.subboost_local_session = token;
      await expect(readSession()).resolves.toBeNull();
    }

    mocks.cookieValues.subboost_local_session = "session-1.secret";
    mocks.prisma.localSession.findUnique.mockResolvedValueOnce(null);
    await expect(readSession()).resolves.toBeNull();

    mocks.prisma.localSession.findUnique.mockResolvedValueOnce({
      id: "session-1",
      tokenHash: digest("secret"),
      expiresAt: new Date(Date.now() - 1000),
      owner: { id: "user-1", username: "alice" },
    });
    await expect(readSession()).resolves.toBeNull();
    expect(mocks.prisma.localSession.deleteMany).toHaveBeenCalledWith({ where: { id: "session-1" } });

    mocks.prisma.localSession.findUnique.mockResolvedValueOnce({
      id: "session-1",
      tokenHash: "short",
      expiresAt: new Date(Date.now() + 60_000),
      owner: { id: "user-1", username: "alice" },
    });
    await expect(readSession()).resolves.toBeNull();

    mocks.prisma.localSession.findUnique.mockResolvedValueOnce({
      id: "session-1",
      tokenHash: digest("different"),
      expiresAt: new Date(Date.now() + 60_000),
      owner: { id: "user-1", username: "alice" },
    });
    await expect(readSession()).resolves.toBeNull();
  });

  it("returns and rotates a valid session", async () => {
    mocks.cookieValues.subboost_local_session = "session-1.secret";
    mocks.prisma.localSession.findUnique.mockResolvedValue({
      id: "session-1",
      tokenHash: digest("secret"),
      expiresAt: new Date(Date.now() + 60_000),
      owner: { id: "user-1", username: "alice" },
    });

    await expect(readSession()).resolves.toEqual({
      sessionId: "session-1",
      userId: "user-1",
      username: "alice",
    });
    expect(mocks.prisma.localSession.update).toHaveBeenCalledTimes(1);
  });

  it("reads and validates double-submit CSRF tokens", async () => {
    await expect(readCsrfToken()).resolves.toBeNull();
    await expect(validateCsrfToken(new Request("http://local.test"))).resolves.toBe(false);

    mocks.cookieValues.subboost_local_csrf = "csrf-token";
    await expect(readCsrfToken()).resolves.toBe("csrf-token");
    await expect(validateCsrfToken(new Request("http://local.test"))).resolves.toBe(false);
    await expect(validateCsrfToken(new Request("http://local.test", {
      headers: { "x-subboost-csrf": "wrong-token" },
    }))).resolves.toBe(false);
    await expect(validateCsrfToken(new Request("http://local.test", {
      headers: { "x-subboost-csrf": " csrf-token " },
    }))).resolves.toBe(true);
  });

  it("generates secure and clear cookie options for HTTP and HTTPS", () => {
    expect(sessionCookieOptions()).toMatchObject({ httpOnly: true, secure: false, maxAge: 604800 });
    expect(csrfCookieOptions()).toMatchObject({ httpOnly: false, secure: false, maxAge: 604800 });
    expect(clearSessionCookieOptions()).toMatchObject({ httpOnly: true, secure: false, maxAge: 0 });
    expect(clearCsrfCookieOptions()).toMatchObject({ httpOnly: false, secure: false, maxAge: 0 });

    mocks.isHttpsAppUrl.mockReturnValue(true);
    expect(sessionCookieOptions().secure).toBe(true);
    expect(csrfCookieOptions().secure).toBe(true);
    expect(clearSessionCookieOptions().secure).toBe(true);
    expect(clearCsrfCookieOptions().secure).toBe(true);
  });
});
