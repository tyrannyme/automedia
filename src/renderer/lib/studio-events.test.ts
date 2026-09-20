import { describe, expect, it } from "vitest";
import { isThumbnailStudioEvent } from "./studio-events.ts";

describe("studio event kinds", () => {
  it("treats thumbnail events as non-authoring", () => {
    expect(isThumbnailStudioEvent("thumbnail_ready")).toBe(true);
    expect(isThumbnailStudioEvent("thumbnail_error")).toBe(true);
    expect(isThumbnailStudioEvent("write_file")).toBe(false);
    expect(isThumbnailStudioEvent("create_composition")).toBe(false);
    expect(isThumbnailStudioEvent("export")).toBe(false);
  });
});
