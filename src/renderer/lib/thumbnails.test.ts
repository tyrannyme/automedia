import { describe, expect, it } from "vitest";
import { compositionThumbnailSrc } from "./thumbnails.ts";

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
