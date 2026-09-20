import { describe, expect, it } from "vitest";
import { newLocalId } from "./ids.ts";

describe("local ids", () => {
  it("prefixes a twelve-character hex id", () => {
    expect(newLocalId("t")).toMatch(/^t[a-f0-9]{12}$/);
    expect(newLocalId("m")).toMatch(/^m[a-f0-9]{12}$/);
    expect(newLocalId("t")).not.toBe(newLocalId("t"));
  });
});
