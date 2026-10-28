import { describe, expect, it } from "vitest";
import type { ActivityEntry } from "../../engine/activity.ts";
import type { ActivityDetail } from "../../engine/events.ts";
import type { MediaTrack } from "@shared/schemas.ts";
import {
  burstSummary,
  dayLabel,
  feedItems,
  feedPlainText,
  formatAge,
  formatLeft,
  groupBursts,
  phraseEntry,
  type FeedContext,
} from "./activity-feed.ts";

const track = (over: Partial<MediaTrack>): MediaTrack => ({
  id: "t-1",
  kind: "block",
  asset: "b-1",
  start: 0,
  duration: 8,
  trimStart: 0,
  rate: 1,
  volume: 1,
  mute: false,
  lane: 0,
  ...over,
});

const context: FeedContext = {
  tracks: [
    track({ id: "t-block", kind: "block", asset: "b-main", name: "Four chords" }),
    track({ id: "t-music", kind: "music", asset: "m-chords", name: "Chords", lane: 1 }),
  ],
  controls: [{ id: "speed", type: "range", label: "Speed", value: 1, min: 0, max: 2, step: 0.25 }],
  exports: [{ jobId: "j-1", format: "mp4", fileName: "j-1.mp4", mtimeMs: 0, bytes: 3_300_000 }],
};

function entry(
  operation: string,
  detail?: ActivityDetail,
  at = "2026-10-27T14:00:00Z",
): ActivityEntry {
  const line: ActivityEntry = { at, operation };
  if (detail !== undefined) line.detail = detail;
  return line;
}

const text = (operation: string, detail?: ActivityDetail) =>
  feedPlainText(phraseEntry(entry(operation, detail), context).text);

describe("activity phrasing", () => {
  it("names the file and the clip it lives in", () => {
    const phrase = phraseEntry(entry("write_file", { path: "music/m-chords/pattern.js" }), context);
    expect(phrase.text).toEqual([
      { value: "Wrote ", file: false },
      { value: "pattern.js", file: true },
      { value: " in Chords", file: false },
    ]);
    expect(phrase.where).toBe("Chords music");
    expect(phrase.verb).toBe("wrote pattern.js");
    expect(phrase.jump).toEqual({ kind: "code", trackId: "t-music" });
    expect(text("write_file", { path: "blocks/b-main/script.js" })).toBe(
      "Wrote script.js in Four chords",
    );
    expect(text("write_file", { path: "blocks/b-gone/style.css" })).toBe(
      "Wrote blocks/b-gone/style.css",
    );
    expect(text("write_file", { path: "assets/beat.ogg" })).toBe("Added beat.ogg to Media");
    expect(text("delete_file", { path: "blocks/b-main/style.css" })).toBe(
      "Deleted style.css in Four chords",
    );
  });

  it("says only that a clip changed, because put_track logs only its id", () => {
    expect(text("put_track", { trackId: "t-music" })).toBe("Changed the Chords clip");
    expect(text("put_track", { trackId: "t-unknown" })).toBe("Changed a clip");
    expect(text("delete_track", { trackId: "t-unknown" })).toBe("Removed a clip");
    expect(text("put_control", { controlId: "speed" })).toBe("Changed Speed");
  });

  it("reads settings, checks and exports from their details", () => {
    expect(text("update_settings", { compositionId: "c", durationSeconds: 8 })).toBe(
      "Set length to 8.0 s",
    );
    expect(text("update_settings", { compositionId: "c", width: 720, height: 900 })).toBe(
      "Set size to 720 × 900",
    );
    expect(text("update_settings", { compositionId: "c", fps: 60, name: "Loop" })).toBe(
      "Changed the project settings",
    );
    const check = phraseEntry(entry("validate", { ok: true }), context);
    expect(feedPlainText(check.text)).toBe("Checked the project");
    expect(check.detail).toBe("no issues");
    const exported = phraseEntry(entry("start_export", { jobId: "j-1", format: "mp4" }), context);
    expect(feedPlainText(exported.text)).toBe("Exported j-1.mp4");
    expect(exported.detail).toBe("3.3 MB");
    expect(exported.verb).toBe("exported an MP4");
    expect(text("start_export", { jobId: "j-2", format: "png" })).toBe("Started a PNG export");
    expect(text("create_composition", { name: "Four chords" })).toBe("Created Four chords");
    expect(text("mystery_op")).toBe("Ran mystery op");
  });
});

const at = (seconds: number) => new Date(Date.UTC(2026, 9, 27, 14, 0, seconds)).toISOString();

describe("activity bursts", () => {
  const items = feedItems(
    [
      entry("put_track", { trackId: "t-music" }, at(0)),
      entry("write_file", { path: "music/m-chords/pattern.js" }, at(30)),
      entry("validate", { ok: true }, at(100)),
      entry("write_file", { path: "blocks/b-main/script.js" }, at(400)),
      entry("broken", undefined, "not a time"),
    ],
    context,
  );

  it("sorts newest first and folds entries under 90 s apart", () => {
    expect(items.map((item) => item.operation)).toEqual([
      "write_file",
      "validate",
      "write_file",
      "put_track",
    ]);
    const bursts = groupBursts(items, null);
    expect(bursts.map((burst) => burst.items.length)).toEqual([1, 3]);
    expect(bursts.every((burst) => burst.holder === null)).toBe(true);
    expect(burstSummary(bursts[1]!)).toBe("3 changes · 2 min");
    expect(burstSummary(bursts[0]!)).toBe("1 change");
  });

  it("names the holder only for bursts that ran while the lease was live", () => {
    const since = Date.parse(at(380));
    const bursts = groupBursts(items, { holder: "Claude", since, until: since + 120_000 });
    expect(bursts.map((burst) => burst.holder)).toEqual(["Claude", null]);
  });
});

describe("activity times", () => {
  it("formats ages, time left and days", () => {
    expect(formatAge(2_000)).toBe("now");
    expect(formatAge(12_000)).toBe("12s");
    expect(formatAge(6 * 60_000)).toBe("6m");
    expect(formatAge(2 * 3_600_000)).toBe("2h");
    expect(formatAge(3 * 86_400_000)).toBe("3d");
    expect(formatLeft(208_000)).toBe("3:28");
    expect(formatLeft(-5)).toBe("0:00");
    const now = new Date(2026, 9, 27, 15).getTime();
    expect(dayLabel(new Date(2026, 9, 27, 1).getTime(), now)).toBe("Today");
    expect(dayLabel(new Date(2026, 9, 26, 23).getTime(), now)).toBe("Yesterday");
    expect(dayLabel(new Date(2026, 9, 20, 12).getTime(), now)).toBe("Oct 20");
  });
});
