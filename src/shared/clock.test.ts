import { describe, expect, it } from "vitest";
import {
  clampTime,
  frameCount,
  frameFromTime,
  isTrackActive,
  mediaTime,
  timeFromFrame,
} from "./clock.ts";

const track = {
  id: "audio",
  kind: "audio" as const,
  asset: "sound.ogg",
  start: 1,
  duration: 2,
  trimStart: 0.5,
  rate: 1.5,
  volume: 1,
  mute: false,
  lane: 0,
};

describe("clock math", () => {
  it("maps frame zero and the last frame", () => {
    expect(frameCount(3, 30)).toBe(90);
    expect(frameFromTime(0, 30, 3)).toBe(0);
    expect(frameFromTime(3, 30, 3)).toBe(89);
    expect(timeFromFrame(30, 30)).toBe(1);
  });

  it("clamps time and keeps the active window half-open", () => {
    expect(clampTime(-1, 3)).toBe(0);
    expect(clampTime(4, 3)).toBe(3);
    expect(isTrackActive(track, 0.99)).toBe(false);
    expect(isTrackActive(track, 1)).toBe(true);
    expect(isTrackActive(track, 3)).toBe(false);
  });

  it("maps composition time into media time", () => {
    expect(mediaTime(track, 1.25)).toBe(0.875);
  });
});
