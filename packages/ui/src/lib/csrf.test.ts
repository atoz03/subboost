import { afterEach, describe, expect, it, vi } from "vitest";
import { getCsrfToken, setCsrfToken, withCsrfHeaders } from "./csrf";

describe("CSRF browser storage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("works without a browser storage surface", () => {
    vi.stubGlobal("window", undefined);
    expect(getCsrfToken()).toBe("");
    expect(() => setCsrfToken("token")).not.toThrow();
    expect(withCsrfHeaders({ "Content-Type": "application/json" })).toEqual({
      "Content-Type": "application/json",
    });
  });

  it("contains storage access errors", () => {
    vi.stubGlobal("window", {
      get localStorage() {
        throw new Error("storage disabled");
      },
    });
    expect(getCsrfToken()).toBe("");
    expect(() => setCsrfToken(null)).not.toThrow();
  });

  it("stores, clears, and applies normalized tokens", () => {
    const storage = {
      getItem: vi.fn(() => "saved-token"),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    vi.stubGlobal("window", { localStorage: storage });

    expect(getCsrfToken()).toBe("saved-token");
    setCsrfToken("  next-token  ");
    expect(storage.setItem).toHaveBeenCalledWith("subboost-local-csrf-token", "next-token");
    setCsrfToken("   ");
    setCsrfToken(null);
    expect(storage.removeItem).toHaveBeenCalledTimes(2);

    const headers = withCsrfHeaders({ "Content-Type": "application/json" });
    expect(new Headers(headers).get("x-subboost-csrf")).toBe("saved-token");
    expect(new Headers(headers).get("content-type")).toBe("application/json");
  });
});
