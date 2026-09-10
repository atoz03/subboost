import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAppOrigin: vi.fn(),
  getCurrentAdmin: vi.fn(),
  validateCsrfToken: vi.fn(),
}));

vi.mock("@local/lib/auth", () => ({ getCurrentAdmin: mocks.getCurrentAdmin }));
vi.mock("@local/lib/env", () => ({ getAppOrigin: mocks.getAppOrigin }));
vi.mock("@local/lib/session", () => ({ validateCsrfToken: mocks.validateCsrfToken }));

import {
  csrfValidationFailedResponse,
  getOptionalCurrentAdmin,
  invalidRequestOriginResponse,
  localAdminRequiredResponse,
  requireCsrfProtection,
  withCurrentAdmin,
  withCurrentAdminAndCsrf,
} from "./api-auth";

async function payload(response: Response) {
  return { status: response.status, body: await response.json() };
}

describe("local API authorization helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAppOrigin.mockReturnValue("https://local.test");
    mocks.validateCsrfToken.mockResolvedValue(true);
  });

  it("builds stable authorization error responses", async () => {
    await expect(payload(localAdminRequiredResponse())).resolves.toMatchObject({ status: 401 });
    await expect(payload(csrfValidationFailedResponse())).resolves.toMatchObject({ status: 403 });
    await expect(payload(invalidRequestOriginResponse())).resolves.toMatchObject({ status: 403 });
  });

  it("checks request origins and double-submit tokens", async () => {
    await expect(requireCsrfProtection(new Request("https://local.test"))).resolves.toBeNull();
    await expect(requireCsrfProtection(new Request("https://local.test", {
      headers: { origin: " https://local.test " },
    }))).resolves.toBeNull();

    mocks.getAppOrigin.mockReturnValueOnce("");
    await expect(requireCsrfProtection(new Request("https://local.test", {
      headers: { origin: "https://other.test" },
    }))).resolves.toBeNull();

    const crossOrigin = await requireCsrfProtection(new Request("https://local.test", {
      headers: { origin: "https://other.test" },
    }));
    expect(crossOrigin?.status).toBe(403);
    expect(mocks.validateCsrfToken).toHaveBeenCalledTimes(3);

    mocks.validateCsrfToken.mockResolvedValueOnce(false);
    await expect(requireCsrfProtection(new Request("https://local.test"))).resolves.toMatchObject({ status: 403 });
  });

  it("requires an administrator before invoking handlers", async () => {
    mocks.getCurrentAdmin.mockResolvedValueOnce(null);
    await expect(getOptionalCurrentAdmin()).resolves.toBeNull();

    mocks.getCurrentAdmin.mockResolvedValueOnce(null);
    await expect(withCurrentAdmin(() => Response.json({ ok: true }))).resolves.toMatchObject({ status: 401 });

    const admin = { id: "user-1", username: "alice" };
    mocks.getCurrentAdmin.mockResolvedValue(admin);
    await expect(withCurrentAdmin((current) => Response.json(current))).resolves.toMatchObject({ status: 200 });

    mocks.getCurrentAdmin.mockResolvedValueOnce(null);
    await expect(withCurrentAdminAndCsrf(
      new Request("https://local.test"),
      () => Response.json({ ok: true }),
    )).resolves.toMatchObject({ status: 401 });

    mocks.validateCsrfToken.mockResolvedValueOnce(false);
    await expect(withCurrentAdminAndCsrf(
      new Request("https://local.test"),
      () => Response.json({ ok: true }),
    )).resolves.toMatchObject({ status: 403 });

    await expect(withCurrentAdminAndCsrf(
      new Request("https://local.test"),
      (current) => Response.json(current),
    )).resolves.toMatchObject({ status: 200 });
  });
});
