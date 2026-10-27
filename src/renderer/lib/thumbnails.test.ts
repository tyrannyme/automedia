import { describe, expect, it } from "vitest";
import { compositionFrameSrc, compositionThumbnailSrc, filmstripTiles } from "./thumbnails.ts";

describe("composition thumbnail src", () => {
  it("points at the loopback PNG and changes when the revision changes", () => {
    const origin = "http://127.0.0.1:47822";
    const first = compositionThumbnailSrc(origin, "cmp_one", 0);
    const next = compositionThumbnailSrc(origin, "cmp_one", 1);
    expect(first).toBe("http://127.0.0.1:47822/compositions/cmp_one/thumbnail.png?rev=0");
    expect(next).toBe("http://127.0.0.1:47822/compositions/cmp_one/thumbnail.png?rev=1");
    expect(first).not.toBe(next);
  });

  it("encodes the composition id", () => {
    expect(compositionThumbnailSrc("http://127.0.0.1:47821/", "cmp/odd", 2)).toBe(
      "http://127.0.0.1:47821/compositions/cmp%2Fodd/thumbnail.png?rev=2",
    );
  });
});

describe("composition frame src", () => {
  it("adds the time and height to the revisioned thumbnail", () => {
    expect(compositionFrameSrc("http://127.0.0.1:1", "c1", 3, 2.5, 36)).toBe(
      "http://127.0.0.1:1/compositions/c1/thumbnail.png?rev=3&t=2.5&h=36",
    );
    expect(compositionFrameSrc("http://127.0.0.1:1", "c1", 0, 1 / 3, 35.6)).toBe(
      "http://127.0.0.1:1/compositions/c1/thumbnail.png?rev=0&t=0.3333&h=36",
    );
  });
});

describe("filmstrip tiles", () => {
  const base = { fps: 30, tileWidth: 64, visibleFrom: 0, visibleTo: 100 };

  it("covers the clip with frames on an absolute grid", () => {
    const tiles = filmstripTiles({ ...base, start: 0, duration: 4, pixelsPerSecond: 64 });
    expect(tiles.map((tile) => tile.time)).toEqual([0, 1, 2, 3]);
    expect(tiles.every((tile) => tile.width === 64)).toBe(true);
    expect(tiles[2]?.left).toBe(128);
  });

  it("starts a moved clip with a partial tile and reuses the grid after it", () => {
    const tiles = filmstripTiles({ ...base, start: 0.5, duration: 2, pixelsPerSecond: 64 });
    expect(tiles.map((tile) => tile.time)).toEqual([0.5, 1, 2]);
    expect(tiles[0]).toMatchObject({ left: 0, width: 32 });
    expect(tiles[2]).toMatchObject({ left: 96, width: 32 });
  });

  it("keeps the same frames for small zoom changes", () => {
    const a = filmstripTiles({ ...base, start: 0, duration: 8, pixelsPerSecond: 60 });
    const b = filmstripTiles({ ...base, start: 0, duration: 8, pixelsPerSecond: 70 });
    expect(a.map((tile) => tile.time)).toEqual(b.map((tile) => tile.time));
  });

  it("asks only for frames in view and never more than a frame apart", () => {
    const tiles = filmstripTiles({
      ...base,
      start: 0,
      duration: 60,
      pixelsPerSecond: 800,
      visibleFrom: 10,
      visibleTo: 11,
    });
    expect(tiles[0]?.time).toBe(10);
    expect(tiles.at(-1)!.time).toBeLessThan(11);
    expect(tiles.length).toBeLessThanOrEqual(18);
    const dense = filmstripTiles({ ...base, start: 0, duration: 1, pixelsPerSecond: 8000 });
    expect(dense[1]!.time - dense[0]!.time).toBeGreaterThanOrEqual(1 / 30 - 1e-9);
  });

  it("returns nothing for a clip out of view", () => {
    expect(
      filmstripTiles({ ...base, start: 5, duration: 1, pixelsPerSecond: 64, visibleTo: 4 }),
    ).toEqual([]);
  });
});
