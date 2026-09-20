import { describe, expect, it } from "vitest";
import {
  clampZoom,
  clipLabel,
  clipEnd,
  dropLineOffset,
  moveClip,
  neededDuration,
  rippleDelete,
  rowIndexAtOffset,
  rowOffset,
  rulerTicks,
  secondsFromX,
  activeSnap,
  snapTime,
  splitClip,
  timelineExtent,
  trimClipEnd,
  trimClipEndOnLane,
  trimClipStart,
  trimClipStartOnLane,
} from "./timeline-math.ts";

const clip = {
  id: "a",
  start: 1,
  duration: 1,
  trimStart: 0.2,
  lane: 0,
};

describe("timeline math", () => {
  it("labels a block by name, then Block", () => {
    expect(clipLabel({ kind: "block", asset: "b1", name: "Intro" })).toBe("Intro");
    expect(clipLabel({ kind: "block", asset: "b1" })).toBe("Block");
    expect(clipLabel({ kind: "music", asset: "b2" })).toBe("Music");
    expect(clipLabel({ kind: "music", asset: "b2", name: "Theme" })).toBe("Theme");
    expect(clipLabel({ kind: "video", asset: "clip.mp4" })).toBe("clip.mp4");
    expect(clipLabel({ kind: "image", asset: "poster.png" })).toBe("poster.png");
  });

  it("clamps zoom", () => {
    expect(clampZoom(1)).toBe(24);
    expect(clampZoom(900)).toBe(800);
  });

  it("snaps to the nearest target inside the threshold", () => {
    expect(snapTime(1.03, [0, 1, 2], 0.05)).toBe(1);
    expect(snapTime(1.2, [0, 1, 2], 0.05)).toBe(1.2);
    expect(activeSnap(1.03, [0, 1, 2], 0.05)).toBe(1);
    expect(activeSnap(1.2, [0, 1, 2], 0.05)).toBeNull();
  });

  it("moves a clip past the current end and only clamps the hard max", () => {
    expect(moveClip(clip, 1.5, 3).start).toBe(1.5);
    expect(moveClip(clip, 9, 3600).start).toBe(9);
    expect(moveClip(clip, 9, 3).start).toBe(2);
    expect(moveClip(clip, -1, 3600).start).toBe(0);
  });

  it("takes duration from the last clip out point", () => {
    expect(neededDuration([clip], 3, 3600)).toBe(2);
    expect(neededDuration([{ ...clip, start: 4 }], 3, 3600)).toBe(5);
    expect(neededDuration([{ ...clip, start: 4 }], 3, 4.5)).toBe(4.5);
    expect(neededDuration([], 3, 3600)).toBe(3);
    expect(timelineExtent([clip], 3, 1)).toBe(4);
  });

  it("trims the start and keeps source in/out paired", () => {
    const next = trimClipStart(clip, 1.25);
    expect(next.start).toBe(1.25);
    expect(next.duration).toBeCloseTo(0.75);
    expect(next.trimStart).toBeCloseTo(0.45);
  });

  it("trims the end past the current composition", () => {
    expect(trimClipEnd(clip, 1.6, 3).duration).toBeCloseTo(0.6);
    expect(trimClipEnd(clip, 9, 3).duration).toBe(2);
    expect(trimClipEnd(clip, 9, 3600).duration).toBe(8);
  });

  it("splits at the playhead", () => {
    const parts = splitClip(clip, 1.4, "b");
    expect(parts?.[0]?.duration).toBeCloseTo(0.4);
    expect(parts?.[1]?.id).toBe("b");
    expect(parts?.[1]?.start).toBeCloseTo(1.4);
    expect(parts?.[1]?.trimStart).toBeCloseTo(0.6);
    expect(splitClip(clip, 0.2, "b")).toBeNull();
  });

  it("keeps trim from crossing a neighbor on the same lane", () => {
    const left = { ...clip, id: "left", start: 0, duration: 1, trimStart: 0 };
    const right = { ...clip, id: "right", start: 1.5, duration: 1, trimStart: 0 };
    expect(trimClipEndOnLane(left, 3, [left, right], 3600).duration).toBeCloseTo(1.5);
    expect(trimClipStartOnLane(right, 0.2, [left, right]).start).toBeCloseTo(1);
  });

  it("places the drop line before the target when moving up", () => {
    const rows = [{ kind: "video" }, { kind: "video" }, { kind: "audio" }];
    expect(dropLineOffset(rows, 2, 0)).toBe(0);
    expect(dropLineOffset(rows, 0, 2)).toBeGreaterThan(0);
    expect(dropLineOffset(rows, 1, 1)).toBeNull();
  });

  it("maps a vertical offset to a row", () => {
    const rows = [{ kind: "video" }, { kind: "audio" }, { kind: "block" }];
    expect(rowIndexAtOffset(rows, 0)).toBe(0);
    expect(rowIndexAtOffset(rows, rowOffset(rows, 1) + 1)).toBe(1);
    expect(rowIndexAtOffset(rows, rowOffset(rows, 2) + 1)).toBe(2);
  });

  it("ripples later clips on the same lane", () => {
    const next = rippleDelete(
      [
        clip,
        { id: "c", start: 2.5, duration: 0.4, trimStart: 0, lane: 0 },
        { id: "d", start: 2.5, duration: 0.4, trimStart: 0, lane: 1 },
      ],
      "a",
    );
    expect(next.find((item) => item.id === "c")?.start).toBe(1.5);
    expect(next.find((item) => item.id === "d")?.start).toBe(2.5);
  });

  it("converts pointer x to seconds and reports clip ends", () => {
    expect(secondsFromX(120, 0, 0, 24)).toBe(5);
    expect(clipEnd(clip)).toBe(2);
  });

  it("emits ruler ticks covering the visible window", () => {
    const ticks = rulerTicks(2, 100, 200, 0);
    expect(ticks[0]?.time).toBe(0);
    expect(ticks.at(-1)?.time).toBeGreaterThanOrEqual(2);
  });
});
