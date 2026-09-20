import { describe, expect, it } from "vitest";
import {
  clipsOverlap,
  compactLanes,
  groupLanes,
  moveClipOnLane,
  neighborBounds,
  nextFreeStart,
  nextLane,
  preferredLane,
  reorderLanes,
  snapStartToLane,
} from "./clips.ts";

const a = { id: "a", start: 0, duration: 3, lane: 0, kind: "block" };
const b = { id: "b", start: 3, duration: 3, lane: 0, kind: "block" };
const c = { id: "c", start: 0, duration: 2, lane: 1, kind: "block" };

describe("clip lanes", () => {
  it("treats touching clips as non-overlapping", () => {
    expect(clipsOverlap(a, b)).toBe(false);
    expect(clipsOverlap(a, { ...b, start: 2.9 })).toBe(true);
  });

  it("groups clips by lane in time order", () => {
    const lanes = groupLanes([b, c, a]);
    expect(lanes.map((lane) => lane.lane)).toEqual([0, 1]);
    expect(lanes[0]?.clips.map((clip) => clip.id)).toEqual(["a", "b"]);
    expect(lanes[1]?.clips.map((clip) => clip.id)).toEqual(["c"]);
  });

  it("places a new clip on the first compatible lane", () => {
    const video = { id: "v", start: 0, duration: 1, lane: 0, kind: "video" };
    expect(preferredLane([video], "block")).toBe(1);
    expect(preferredLane([a, c], "block", 1)).toBe(1);
    expect(preferredLane([a], "block")).toBe(0);
    expect(nextLane([a, c])).toBe(2);
  });

  it("pushes a new clip past occupants on the same lane", () => {
    expect(nextFreeStart([a], 0, 0, 3)).toBe(3);
    expect(nextFreeStart([a], 0, 3, 3)).toBe(3);
    expect(nextFreeStart([a, b], 0, 1.5, 2)).toBe(6);
    expect(nextFreeStart([a, { ...b, start: 5 }], 0, 3, 2)).toBe(3);
  });

  it("reorders whole lanes and keeps clips together", () => {
    const next = reorderLanes([a, b, c], 1, 0);
    expect(next.find((clip) => clip.id === "c")?.lane).toBe(0);
    expect(next.find((clip) => clip.id === "a")?.lane).toBe(1);
    expect(next.find((clip) => clip.id === "b")?.lane).toBe(1);
  });

  it("compacts a hole after a lane is removed", () => {
    expect(compactLanes([a, c]).map((clip) => clip.lane)).toEqual([0, 1]);
    expect(compactLanes([{ ...c, lane: 4 }]).map((clip) => clip.lane)).toEqual([0]);
  });

  it("snaps a move into the nearest gap on the lane", () => {
    const moved = moveClipOnLane(b, 1, [a, b, c], 3600);
    expect(moved.start).toBe(3);
    expect(moveClipOnLane(c, 0, [a, b, c], 3600).start).toBe(0);
    expect(snapStartToLane(1, [a], 2, 3600)).toBe(3);
  });

  it("reports neighbor edges for trim", () => {
    expect(neighborBounds(b, [a, b])).toEqual({ prevEnd: 3, nextStart: Number.POSITIVE_INFINITY });
    expect(neighborBounds(a, [a, b]).nextStart).toBe(3);
  });
});
