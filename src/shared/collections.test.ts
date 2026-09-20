import { describe, expect, it } from "vitest";
import { replaceById, upsertById } from "./collections.ts";

describe("id collections", () => {
  it("inserts a new item and replaces an existing one", () => {
    const first = upsertById([{ id: "a", n: 1 }], { id: "b", n: 2 });
    expect(first).toEqual([
      { id: "a", n: 1 },
      { id: "b", n: 2 },
    ]);
    expect(upsertById(first, { id: "a", n: 9 })).toEqual([
      { id: "a", n: 9 },
      { id: "b", n: 2 },
    ]);
  });

  it("replaces a known id without appending", () => {
    expect(
      replaceById(
        [
          { id: "a", n: 1 },
          { id: "b", n: 2 },
        ],
        { id: "b", n: 8 },
      ),
    ).toEqual([
      { id: "a", n: 1 },
      { id: "b", n: 8 },
    ]);
  });
});
