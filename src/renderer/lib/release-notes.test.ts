import { describe, expect, it } from "vitest";
import { stripCredit } from "./release-notes.ts";

describe("release notes", () => {
  it("drops the generated author credit", () => {
    expect(
      stripCredit(
        "Add easy updates by @tyrannyme in https://github.com/tyrannyme/automedia/pull/5",
      ),
    ).toBe("Add easy updates");
    expect(stripCredit("Add easy updates by @tyrannyme in #5")).toBe("Add easy updates");
  });

  it("keeps lines that carry no credit", () => {
    expect(stripCredit("  Faster exports  ")).toBe("Faster exports");
    expect(stripCredit("Stand by me")).toBe("Stand by me");
  });
});
