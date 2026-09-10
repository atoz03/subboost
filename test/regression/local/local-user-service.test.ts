import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  compare: vi.fn(),
  hash: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    localAdmin: {
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  transaction: {
    $queryRaw: vi.fn(),
    localAdmin: {
      count: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("bcryptjs", () => ({
  default: { compare: mocks.compare, hash: mocks.hash },
}));

vi.mock("@local/lib/prisma", () => ({ prisma: mocks.prisma }));

import {
  createInitialAdmin,
  createLocalUser,
  isSetupRequired,
  listLocalUsers,
  updateLocalUserAccount,
  verifyLocalUser,
} from "../../../local/src/lib/local-user-service";

const validPassword = "correct-horse-battery";
const savedUser = { id: "user-1", username: "alice", passwordHash: "saved-hash" };

describe("local user service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hash.mockResolvedValue("new-hash");
    mocks.compare.mockResolvedValue(true);
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.transaction));
    mocks.prisma.localAdmin.findUnique.mockResolvedValue(savedUser);
    mocks.prisma.localAdmin.create.mockResolvedValue({ id: "user-2", username: "bob" });
    mocks.prisma.localAdmin.update.mockResolvedValue({ id: "user-1", username: "alice" });
    mocks.transaction.localAdmin.count.mockResolvedValue(0);
    mocks.transaction.localAdmin.create.mockResolvedValue({ id: "user-1", username: "alice" });
  });

  it("detects setup state and formats user summaries", async () => {
    mocks.prisma.localAdmin.count.mockResolvedValueOnce(0).mockResolvedValueOnce(2);
    await expect(isSetupRequired()).resolves.toBe(true);
    await expect(isSetupRequired()).resolves.toBe(false);

    mocks.prisma.localAdmin.findMany.mockResolvedValue([
      {
        id: "user-1",
        username: "alice",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        lastLoginAt: null,
        _count: { subscriptions: 2, templates: 3 },
      },
      {
        id: "user-2",
        username: "bob",
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
        updatedAt: new Date("2026-02-02T00:00:00.000Z"),
        lastLoginAt: new Date("2026-02-03T00:00:00.000Z"),
        _count: { subscriptions: 0, templates: 1 },
      },
    ]);

    await expect(listLocalUsers()).resolves.toEqual([
      expect.objectContaining({ id: "user-1", lastLoginAt: null, subscriptionCount: 2, templateCount: 3 }),
      expect.objectContaining({ id: "user-2", lastLoginAt: "2026-02-03T00:00:00.000Z" }),
    ]);
  });

  it("validates initial administrator input and serializes initialization", async () => {
    for (const body of [null, [], "bad"]) {
      await expect(createInitialAdmin(body)).rejects.toThrow("请求体无效");
    }
    await expect(createInitialAdmin({ password: validPassword, passwordConfirm: validPassword })).rejects.toThrow("用户名不能为空");
    await expect(createInitialAdmin({ username: "ab", password: validPassword, passwordConfirm: validPassword })).rejects.toThrow("3 到 32");
    await expect(createInitialAdmin({ username: "a".repeat(33), password: validPassword, passwordConfirm: validPassword })).rejects.toThrow("3 到 32");
    await expect(createInitialAdmin({ username: "bad$user", password: validPassword, passwordConfirm: validPassword })).rejects.toThrow("只能包含");
    await expect(createInitialAdmin({ username: "alice", password: 123, passwordConfirm: 123 })).rejects.toThrow("至少为 12 位");
    await expect(createInitialAdmin({ username: "alice", password: validPassword, passwordConfirm: "different-password" })).rejects.toThrow("密码不一致");

    await expect(createInitialAdmin({
      username: " alice ",
      password: validPassword,
      passwordConfirm: validPassword,
    })).resolves.toEqual({ id: "user-1", username: "alice" });
    expect(mocks.hash).toHaveBeenCalledWith(validPassword, 12);
    expect(mocks.transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mocks.transaction.localAdmin.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ username: "alice", passwordHash: "new-hash", lastLoginAt: expect.any(Date) }),
    }));

    mocks.transaction.localAdmin.count.mockResolvedValueOnce(1);
    await expect(createInitialAdmin({ username: "alice", password: validPassword, passwordConfirm: validPassword }))
      .rejects.toThrow("系统已初始化");
  });

  it("verifies credentials and records a successful login", async () => {
    await expect(verifyLocalUser(undefined, validPassword)).resolves.toBeNull();
    await expect(verifyLocalUser("alice", null)).resolves.toBeNull();

    mocks.prisma.localAdmin.findUnique.mockResolvedValueOnce(null);
    await expect(verifyLocalUser(" alice ", validPassword)).resolves.toBeNull();

    mocks.compare.mockResolvedValueOnce(false);
    await expect(verifyLocalUser("alice", validPassword)).resolves.toBeNull();

    await expect(verifyLocalUser("alice", validPassword)).resolves.toEqual({ id: "user-1", username: "alice" });
    expect(mocks.prisma.localAdmin.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { lastLoginAt: expect.any(Date) },
    });
  });

  it("updates usernames and passwords while rejecting invalid changes", async () => {
    await expect(updateLocalUserAccount("user-1", null)).rejects.toThrow("请求体无效");
    await expect(updateLocalUserAccount("user-1", [])).rejects.toThrow("请求体无效");
    mocks.prisma.localAdmin.findUnique.mockResolvedValueOnce(null);
    await expect(updateLocalUserAccount("missing", {})).rejects.toThrow("用户不存在");

    await expect(updateLocalUserAccount("user-1", {})).resolves.toEqual({ id: "user-1", username: "alice" });
    await expect(updateLocalUserAccount("user-1", { username: "alice" })).resolves.toEqual({
      id: "user-1",
      username: "alice",
    });
    await expect(updateLocalUserAccount("user-1", { username: "x" })).rejects.toThrow("3 到 32");

    mocks.prisma.localAdmin.update.mockResolvedValueOnce({ id: "user-1", username: "alice.new" });
    await expect(updateLocalUserAccount("user-1", { username: " alice.new " }))
      .resolves.toEqual({ id: "user-1", username: "alice.new" });

    await expect(updateLocalUserAccount("user-1", { newPassword: validPassword })).rejects.toThrow("必须填写当前密码");
    mocks.compare.mockResolvedValueOnce(false);
    await expect(updateLocalUserAccount("user-1", {
      currentPassword: "wrong-password",
      newPassword: validPassword,
      passwordConfirm: validPassword,
    })).rejects.toThrow("当前密码不正确");
    await expect(updateLocalUserAccount("user-1", {
      currentPassword: "old-password",
      newPassword: "short",
      passwordConfirm: "short",
    })).rejects.toThrow("至少为 12 位");
    await expect(updateLocalUserAccount("user-1", {
      currentPassword: "old-password",
      newPassword: validPassword,
      passwordConfirm: "different-password",
    })).rejects.toThrow("新密码不一致");

    await expect(updateLocalUserAccount("user-1", {
      username: "alice.updated",
      currentPassword: "old-password",
      newPassword: validPassword,
      passwordConfirm: validPassword,
    })).resolves.toEqual({ id: "user-1", username: "alice" });
    expect(mocks.prisma.localAdmin.update).toHaveBeenLastCalledWith({
      where: { id: "user-1" },
      data: { username: "alice.updated", passwordHash: "new-hash" },
      select: { id: true, username: true },
    });
  });

  it("validates and creates additional local users", async () => {
    await expect(createLocalUser(false)).rejects.toThrow("请求体无效");
    await expect(createLocalUser({ username: "", password: validPassword, passwordConfirm: validPassword })).rejects.toThrow("用户名不能为空");
    await expect(createLocalUser({ username: "bob", password: "short", passwordConfirm: "short" })).rejects.toThrow("至少为 12 位");
    await expect(createLocalUser({ username: "bob", password: validPassword, passwordConfirm: "different-password" })).rejects.toThrow("密码不一致");
    await expect(createLocalUser({ username: " bob ", password: validPassword, passwordConfirm: validPassword }))
      .resolves.toEqual({ id: "user-2", username: "bob" });
    expect(mocks.prisma.localAdmin.create).toHaveBeenCalledWith({
      data: { username: "bob", passwordHash: "new-hash" },
      select: { id: true, username: true },
    });
  });
});
