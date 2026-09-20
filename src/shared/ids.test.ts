import { describe, expect, it } from "vitest";
import { compositionIdPattern, controlIdPattern, isCompositionId } from "./ids.ts";

describe("id patterns", () => {
  it("accepts composition ids used on disk and in URLs", () => {
    expect(isCompositionId("c1a2b3")).toBe(true);
    expect(isCompositionId("proof-clock")).toBe(true);
    expect(isCompositionId("Index.html")).toBe(false);
    expect(isCompositionId("../x")).toBe(false);
    expect(compositionIdPattern.test("c1")).toBe(true);
  });

  it("requires control ids to start with a letter", () => {
    expect(controlIdPattern.test("gain")).toBe(true);
    expect(controlIdPattern.test("1gain")).toBe(false);
  });
});
