import { describe, expect, it } from "vitest";
import { diffLines } from "./line-diff.ts";

describe("diffLines", () => {
  it("folds identical text into one run", () => {
    expect(diffLines("a\nb\nc", "a\nb\nc")).toEqual([{ kind: "same", start: 1, count: 3 }]);
  });

  it("finds one changed line between unchanged runs", () => {
    expect(diffLines("a\nb\nc\nd", "a\nB\nc\nd")).toEqual([
      { kind: "same", start: 1, count: 1 },
      { kind: "change", mine: { start: 2, lines: ["b"] }, theirs: { start: 2, lines: ["B"] } },
      { kind: "same", start: 3, count: 2 },
    ]);
  });

  it("keeps separate changes apart", () => {
    const segments = diffLines("1\n2\n3\n4\n5\n6", "1\nx\n3\n4\ny\n6");
    expect(segments.map((segment) => segment.kind)).toEqual([
      "same",
      "change",
      "same",
      "change",
      "same",
    ]);
  });

  it("handles lines only one side has", () => {
    expect(diffLines("a\nc", "a\nb\nc")).toEqual([
      { kind: "same", start: 1, count: 1 },
      { kind: "change", mine: { start: 2, lines: [] }, theirs: { start: 2, lines: ["b"] } },
      { kind: "same", start: 2, count: 1 },
    ]);
  });
});
