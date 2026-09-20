import { describe, expect, it } from "vitest";
import { applyReorder, moveId, sortByOrder } from "./order.ts";

describe("sortByOrder", () => {
  it("honors a saved order and appends unknown ids after", () => {
    const items = [
      { id: "c", createdAt: "2026-01-03T00:00:00.000Z" },
      { id: "a", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "b", createdAt: "2026-01-02T00:00:00.000Z" },
    ];
    expect(sortByOrder(items, ["b", "a"]).map((item) => item.id)).toEqual(["b", "a", "c"]);
  });

  it("falls back to newest created first when no order exists", () => {
    const items = [
      { id: "a", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "c", createdAt: "2026-01-03T00:00:00.000Z" },
      { id: "b", createdAt: "2026-01-02T00:00:00.000Z" },
    ];
    expect(sortByOrder(items, []).map((item) => item.id)).toEqual(["c", "b", "a"]);
  });
});

describe("moveId", () => {
  it("moves the first item after the next row", () => {
    expect(moveId(["a", "b"], "a", "b", true)).toEqual(["b", "a"]);
  });

  it("moves the last item before the first row", () => {
    expect(moveId(["a", "b"], "b", "a", false)).toEqual(["b", "a"]);
  });

  it("appends when the target is the tail", () => {
    expect(moveId(["a", "b", "c"], "a", null)).toEqual(["b", "c", "a"]);
  });
});

describe("applyReorder", () => {
  it("keeps only known ids and appends the rest in current order", () => {
    expect(applyReorder(["a", "b", "c"], ["c", "missing", "a"])).toEqual(["c", "a", "b"]);
  });
});
