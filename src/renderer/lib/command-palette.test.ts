import { describe, expect, it } from "vitest";
import {
  chordKeys,
  isMac,
  isPaletteChord,
  matches,
  nextGroupStart,
  orderProjects,
  stepIndex,
} from "./command-palette.ts";

const key = (overrides: Partial<KeyboardEvent>) => ({
  key: "k",
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...overrides,
});

describe("command palette", () => {
  it("labels keys per platform", () => {
    expect(isMac("MacIntel")).toBe(true);
    expect(isMac("Linux x86_64")).toBe(false);
    expect(chordKeys(["shift", "mod", "a"], true)).toEqual(["⇧", "⌘", "A"]);
    expect(chordKeys(["shift", "mod", "a"], false)).toEqual(["⇧", "Ctrl", "A"]);
    expect(chordKeys(["space"], false)).toEqual(["Space"]);
  });

  it("opens on ⌘K or Ctrl+K only", () => {
    expect(isPaletteChord(key({ metaKey: true }), true)).toBe(true);
    expect(isPaletteChord(key({ ctrlKey: true }), false)).toBe(true);
    expect(isPaletteChord(key({ ctrlKey: true }), true)).toBe(false);
    expect(isPaletteChord(key({ ctrlKey: true, shiftKey: true }), false)).toBe(false);
    expect(isPaletteChord(key({ key: "j", ctrlKey: true }), false)).toBe(false);
  });

  it("matches every word in any order", () => {
    expect(matches("", "Export")).toBe(true);
    expect(matches("png frame", "Export this frame as PNG")).toBe(true);
    expect(matches("gif", "Export this frame as PNG")).toBe(false);
  });

  it("puts open tabs first", () => {
    const projects = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(orderProjects(projects, ["c", "a"]).map((item) => item.id)).toEqual(["c", "a", "b"]);
    expect(orderProjects(projects, ["gone"]).map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("wraps selection and jumps groups", () => {
    expect(stepIndex(0, -1, 4)).toBe(3);
    expect(stepIndex(3, 1, 4)).toBe(0);
    const groups = [
      [0, 3],
      [3, 0],
      [3, 5],
    ] as const;
    expect(nextGroupStart(1, groups)).toBe(3);
    expect(nextGroupStart(4, groups)).toBe(0);
    expect(nextGroupStart(4, groups, true)).toBe(0);
  });
});
