import { describe, expect, it } from "vitest";
import { applyPlaybackTime, applyPreviewTime, playFrom, wrapPlayback } from "./playback.ts";

describe("playFrom", () => {
  it("starts from the current playhead", () => {
    expect(playFrom(1.2, 2)).toEqual({ playheadSeconds: 1.2, playing: true });
  });

  it("rewinds when the playhead is at the end", () => {
    expect(playFrom(2, 2)).toEqual({ playheadSeconds: 0, playing: true });
  });
});

describe("applyPlaybackTime", () => {
  it("keeps time while playing inside the duration", () => {
    expect(applyPlaybackTime(1.5, 2, false)).toEqual({
      playheadSeconds: 1.5,
      playing: true,
      wrapped: false,
    });
  });

  it("stops at the end when loop is off", () => {
    expect(applyPlaybackTime(2, 2, false)).toEqual({
      playheadSeconds: 2,
      playing: false,
      wrapped: false,
    });
  });

  it("wraps to the start when loop is on", () => {
    expect(applyPlaybackTime(2, 2, true)).toEqual({
      playheadSeconds: 0,
      playing: true,
      wrapped: true,
    });
  });

  it("keeps the overshoot when looping so the clock does not stall on duration", () => {
    expect(applyPlaybackTime(2.5, 2, true)).toEqual({
      playheadSeconds: 0.5,
      playing: true,
      wrapped: true,
    });
  });
});

describe("applyPreviewTime", () => {
  it("ignores late preview time after the editor has paused", () => {
    expect(applyPreviewTime(false, 1.5, 3, false)).toBeNull();
    expect(applyPreviewTime(true, 1.5, 3, false)).toEqual({
      playheadSeconds: 1.5,
      playing: true,
      wrapped: false,
    });
  });
});

describe("wrapPlayback", () => {
  it("does not use duration as a display time when looping", () => {
    expect(wrapPlayback(3, 3, true)).toEqual({
      timeSeconds: 0,
      playing: true,
      wrapped: true,
    });
  });

  it("keeps duration when loop is off so the parent can stop", () => {
    expect(wrapPlayback(3, 3, false)).toEqual({
      timeSeconds: 3,
      playing: false,
      wrapped: false,
    });
  });
});
