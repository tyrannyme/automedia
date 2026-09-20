import { describe, expect, it } from "vitest";
import { loopbackPort } from "./limits.ts";
import { resolvePort } from "./ports.ts";

describe("resolvePort", () => {
  it("uses the fallback when the value is missing or empty", () => {
    expect(resolvePort(undefined, loopbackPort)).toBe(loopbackPort);
    expect(resolvePort("", loopbackPort)).toBe(loopbackPort);
  });

  it("accepts a valid TCP port", () => {
    expect(resolvePort("49124", loopbackPort)).toBe(49124);
  });

  it("rejects non-integers and out-of-range values", () => {
    expect(resolvePort("not-a-port", loopbackPort)).toBe(loopbackPort);
    expect(resolvePort("0", loopbackPort)).toBe(loopbackPort);
    expect(resolvePort("65536", loopbackPort)).toBe(loopbackPort);
  });
});
