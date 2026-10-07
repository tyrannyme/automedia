import { describe, expect, it } from "vitest";
import { isAllowedLoopbackOrigin } from "./http-cors.ts";

describe("isAllowedLoopbackOrigin", () => {
  it("allows packaged Electron's opaque origin", () => {
    expect(isAllowedLoopbackOrigin("null")).toBe(true);
  });

  it("allows HTTP loopback origins with a port", () => {
    expect(isAllowedLoopbackOrigin("http://localhost:5173")).toBe(true);
    expect(isAllowedLoopbackOrigin("http://127.0.0.1:49123")).toBe(true);
  });

  it("rejects non-loopback, credentials, and non-http origins", () => {
    expect(isAllowedLoopbackOrigin("https://localhost:5173")).toBe(false);
    expect(isAllowedLoopbackOrigin("http://example.com")).toBe(false);
    expect(isAllowedLoopbackOrigin("http://user:pass@localhost")).toBe(false);
    expect(isAllowedLoopbackOrigin("http://localhost/path")).toBe(false);
    expect(isAllowedLoopbackOrigin("not a url")).toBe(false);
  });
});
