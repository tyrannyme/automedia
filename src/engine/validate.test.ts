import { afterEach, describe, expect, it } from "vitest";
import { loopbackPort } from "@shared/limits.ts";
import { mediaPrepareCount } from "@shared/media.ts";
import { resolveLoopbackUrl } from "./loopback.ts";

const previousPort = process.env.AUTOMEDIA_LOOPBACK_PORT;

afterEach(() => {
  if (previousPort === undefined) delete process.env.AUTOMEDIA_LOOPBACK_PORT;
  else process.env.AUTOMEDIA_LOOPBACK_PORT = previousPort;
});

describe("media prepare count", () => {
  it("ignores block tracks so a block-only timeline can validate", () => {
    expect(
      mediaPrepareCount([
        { kind: "block" },
        { kind: "block" },
        { kind: "video" },
        { kind: "audio" },
      ]),
    ).toBe(2);
    expect(mediaPrepareCount([{ kind: "block" }, { kind: "block" }])).toBe(0);
  });
});

describe("loopback URL re-export", () => {
  it("keeps the validate module's public resolver", () => {
    process.env.AUTOMEDIA_LOOPBACK_PORT = "49124";
    expect(resolveLoopbackUrl()).toBe("http://127.0.0.1:49124");
  });

  it("falls back to the default port for invalid configuration", () => {
    process.env.AUTOMEDIA_LOOPBACK_PORT = "not-a-port";
    expect(resolveLoopbackUrl()).toBe(`http://127.0.0.1:${loopbackPort}`);
  });
});
