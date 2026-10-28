import { describe, expect, it } from "vitest";
import { fitInside, initialOf, lastTouch, shortAge, visibleProjects } from "./home.ts";

const now = Date.parse("2026-10-27T12:00:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();

describe("Home gallery", () => {
  it("prints short ages", () => {
    expect(shortAge(ago(10_000), now)).toBe("now");
    expect(shortAge(ago(18 * 60_000), now)).toBe("18m");
    expect(shortAge(ago(2 * 3_600_000), now)).toBe("2h");
    expect(shortAge(ago(3 * 86_400_000), now)).toBe("3d");
    expect(shortAge(ago(15 * 86_400_000), now)).toBe("2w");
  });

  it("names the claim holder, or You when nobody holds the project", () => {
    expect(
      lastTouch({ lease: { holder: "Claude", until: ago(-60_000) }, updatedAt: ago(0) }, now),
    ).toEqual({ who: "Claude", live: true, when: "now" });
    expect(lastTouch({ lease: null, updatedAt: ago(5 * 60_000) }, now)).toEqual({
      who: "You",
      live: false,
      when: "5m",
    });
    expect(initialOf(" codex")).toBe("C");
  });

  it("searches names and sorts by custom order, last edit, or name", () => {
    const items = [
      { name: "Aurora", updatedAt: ago(3_000) },
      { name: "chrome knot", updatedAt: ago(1_000) },
      { name: "Beat", updatedAt: ago(2_000) },
    ];
    expect(visibleProjects(items, "", "custom").map((item) => item.name)).toEqual([
      "Aurora",
      "chrome knot",
      "Beat",
    ]);
    expect(visibleProjects(items, "", "edited").map((item) => item.name)).toEqual([
      "chrome knot",
      "Beat",
      "Aurora",
    ]);
    expect(visibleProjects(items, "", "name").map((item) => item.name)).toEqual([
      "Aurora",
      "Beat",
      "chrome knot",
    ]);
    expect(visibleProjects(items, "KNOT", "custom").map((item) => item.name)).toEqual([
      "chrome knot",
    ]);
  });

  it("fits a frame inside a box at its true shape", () => {
    expect(fitInside(1280, 720, 257, 126)).toEqual([224, 126]);
    expect(fitInside(720, 1280, 257, 126)).toEqual([71, 126]);
  });
});
