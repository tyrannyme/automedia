import { describe, expect, it } from "vitest";
import { canSendPreviewMessage, isPreviewFrameMessage } from "./preview-messaging.ts";

describe("preview messaging guards", () => {
  it("requires the current frame URL to be loaded and ready", () => {
    const expectedSrc = "http://127.0.0.1:47821/compositions/demo/content/index.html";
    const state = { loadedSrc: expectedSrc, readySrc: expectedSrc };

    expect(canSendPreviewMessage(state, expectedSrc, expectedSrc)).toBe(true);
    expect(canSendPreviewMessage(state, "about:blank", expectedSrc)).toBe(false);
    expect(
      canSendPreviewMessage({ loadedSrc: null, readySrc: expectedSrc }, expectedSrc, expectedSrc),
    ).toBe(false);
    expect(
      canSendPreviewMessage({ loadedSrc: expectedSrc, readySrc: null }, expectedSrc, expectedSrc),
    ).toBe(false);
  });

  it("accepts messages only from the expected origin and frame", () => {
    // SAFETY: the guard compares source identity only; this test double need not implement the interface.
    const source = {} as MessageEventSource;
    const event = { origin: "http://127.0.0.1:47821", source };

    expect(isPreviewFrameMessage(event, event.origin, source)).toBe(true);
    expect(isPreviewFrameMessage(event, "http://localhost:5173", source)).toBe(false);
    // SAFETY: the guard compares source identity only; this test double need not implement the interface.
    const differentSource = {} as MessageEventSource;
    expect(isPreviewFrameMessage(event, event.origin, differentSource)).toBe(false);
  });
});
