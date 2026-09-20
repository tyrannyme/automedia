import { afterEach, describe, expect, it } from "vitest";
import { cdpPort } from "@shared/limits.ts";
import { cdpOrigin, resolveCdpPort } from "./cdp.ts";

const previousPort = process.env.AUTOMEDIA_CDP_PORT;

afterEach(() => {
  if (previousPort === undefined) delete process.env.AUTOMEDIA_CDP_PORT;
  else process.env.AUTOMEDIA_CDP_PORT = previousPort;
});

describe("CDP port resolution", () => {
  it("uses the default localhost port", () => {
    delete process.env.AUTOMEDIA_CDP_PORT;
    expect(resolveCdpPort()).toBe(cdpPort);
    expect(cdpOrigin()).toBe(`http://127.0.0.1:${cdpPort}`);
  });

  it("uses the configured alternate port", () => {
    process.env.AUTOMEDIA_CDP_PORT = "9333";
    expect(resolveCdpPort()).toBe(9333);
    expect(cdpOrigin()).toBe("http://127.0.0.1:9333");
  });

  it("falls back to the default port for invalid configuration", () => {
    process.env.AUTOMEDIA_CDP_PORT = "not-a-port";
    expect(resolveCdpPort()).toBe(cdpPort);
  });
});
