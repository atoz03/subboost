import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { apiError, getStringField, readJsonBody } from "@local/lib/http";
import { prisma } from "@local/lib/prisma";
import { sessionCookieOptions, signSession, SESSION_COOKIE } from "@local/lib/session";

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body) return apiError("Invalid JSON body.", "BAD_REQUEST", 400);

  const existingCount = await prisma.localAdmin.count();
  if (existingCount > 0) {
    return apiError("Administrator already exists.", "CONFLICT", 409);
  }

  const username = getStringField(body, "username");
  const password = getStringField(body, "password");
  const passwordConfirm = getStringField(body, "passwordConfirm");
  if (!username || password.length < 10 || password !== passwordConfirm) {
    return apiError("Invalid administrator credentials.", "BAD_REQUEST", 400);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.localAdmin.create({
    data: { username, passwordHash, lastLoginAt: new Date() },
    select: { id: true, username: true },
  });

  const response = NextResponse.json({
    success: true,
    user: admin,
  });
  response.cookies.set(SESSION_COOKIE, await signSession({ adminId: admin.id, username: admin.username }), sessionCookieOptions());
  return response;
}
