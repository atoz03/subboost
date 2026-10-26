import { describe, expect, it } from "vitest";
import { getNodeEndpointError } from "@subboost/core/node-endpoint";
import { migrateLegacyMieruNodes } from "./legacy-mieru-endpoint";

describe("legacy Mieru endpoint migration", () => {
  it("drops the internal port from saved Mieru range nodes", () => {
    const legacy = {
      name: "Mieru",
      type: "mieru",
      server: "mieru.example.com",
      port: 2999,
      "port-range": "2999-3001",
      username: "user",
      password: "pass",
      transport: "TCP",
    };
    expect(getNodeEndpointError(legacy)).toContain("port 与 port-range");

    const [migrated] = migrateLegacyMieruNodes([legacy]);
    expect(migrated).not.toHaveProperty("port");
    expect(migrated).toMatchObject({ "port-range": "2999-3001", username: "user" });
    expect(getNodeEndpointError(migrated)).toBeNull();
  });

  it("returns the original list when nothing needs migration", () => {
    const nodes = [
      { name: "Single", type: "mieru", server: "mieru.example.com", port: 2999 },
      { name: "Range", type: "mieru", server: "mieru.example.com", "port-range": "2999-3001" },
      { name: "Other", type: "hysteria2", server: "hy.example.com", port: 443, "port-range": "1-2" },
    ];
    expect(migrateLegacyMieruNodes(nodes)).toBe(nodes);
    expect(migrateLegacyMieruNodes(undefined)).toBeUndefined();
  });
});
