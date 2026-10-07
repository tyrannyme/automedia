import { describe, expect, it } from "vitest";
import { findFreePort } from "./free-port.ts";

describe("findFreePort", () => {
  it("returns an unused TCP port on loopback", async () => {
    const port = await findFreePort();
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThanOrEqual(65_535);
  });
});
