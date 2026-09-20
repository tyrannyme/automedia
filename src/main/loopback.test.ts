import { afterEach, describe, expect, it } from "vitest";
import { loopbackPort } from "@shared/limits.ts";
import {
  compositionContentUrl,
  compositionExportUrl,
  resolveLoopbackPort,
  resolveLoopbackUrl,
} from "./loopback.ts";

const previousPort = process.env.AUTOMEDIA_LOOPBACK_PORT;

afterEach(() => {
  if (previousPort === undefined) delete process.env.AUTOMEDIA_LOOPBACK_PORT;
  else process.env.AUTOMEDIA_LOOPBACK_PORT = previousPort;
});

describe("loopback URLs", () => {
  it("uses a live server URL supplied by the caller", () => {
    expect(resolveLoopbackUrl(() => "http://127.0.0.1:49123/")).toBe("http://127.0.0.1:49123");
  });

  it("uses the configured alternate port when no provider is supplied", () => {
    process.env.AUTOMEDIA_LOOPBACK_PORT = "49124";
    expect(resolveLoopbackPort()).toBe(49124);
    expect(resolveLoopbackUrl()).toBe("http://127.0.0.1:49124");
  });

  it("falls back to the default port for invalid configuration", () => {
    process.env.AUTOMEDIA_LOOPBACK_PORT = "not-a-port";
    expect(resolveLoopbackUrl()).toBe(`http://127.0.0.1:${loopbackPort}`);
  });

  it("builds content and export URLs from a bound origin", () => {
    expect(compositionContentUrl("http://127.0.0.1:49123/", "c1")).toBe(
      "http://127.0.0.1:49123/compositions/c1/content/index.html",
    );
    expect(compositionExportUrl("http://127.0.0.1:49123", "c1", "j1")).toBe(
      "http://127.0.0.1:49123/compositions/c1/exports/j1",
    );
  });
});
