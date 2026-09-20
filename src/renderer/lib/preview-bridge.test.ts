import { describe, expect, it } from "vitest";
import {
  enqueueUntilOrigin,
  iframeTargetOrigin,
  originFromUrl,
  previewIframeTargetOrigin,
  readWindowOrigin,
  takeQueuedMessages,
  type PreviewContentWindow,
} from "./preview-bridge.ts";

const loopback = "http://127.0.0.1:47821";
const vite = "http://localhost:5173";
const compositionSrc = `${loopback}/compositions/cmp_test/content/index.html`;

describe("preview iframe postMessage origin", () => {
  it("reads an absolute src origin", () => {
    expect(originFromUrl(compositionSrc)).toBe(loopback);
    expect(originFromUrl("not a url")).toBeNull();
  });

  it("withholds messages while the iframe is still on the parent origin", () => {
    expect(previewIframeTargetOrigin(compositionSrc, loopback, vite)).toBeNull();
    expect(iframeTargetOrigin(compositionSrc, { location: { origin: vite } }, loopback)).toBeNull();
  });

  it("accepts the loopback origin once the composition document is loaded", () => {
    expect(previewIframeTargetOrigin(compositionSrc, loopback, loopback)).toBe(loopback);
    expect(iframeTargetOrigin(compositionSrc, { location: { origin: loopback } }, loopback)).toBe(
      loopback,
    );
  });

  it("accepts a cross-origin frame only when src already matches the expected origin", () => {
    const blocked: PreviewContentWindow = {
      get location(): { origin: string } {
        throw new Error("blocked");
      },
    };
    expect(readWindowOrigin(blocked)).toBeUndefined();
    expect(iframeTargetOrigin(compositionSrc, blocked, loopback)).toBe(loopback);
    expect(iframeTargetOrigin(`${vite}/index.html`, blocked, loopback)).toBeNull();
  });

  it("never targets the expected origin when src is still the parent document", () => {
    expect(previewIframeTargetOrigin(`${vite}/`, loopback, undefined)).toBeNull();
    expect(iframeTargetOrigin("", { location: { origin: vite } }, loopback)).toBeNull();
    expect(iframeTargetOrigin(compositionSrc, null, loopback)).toBeNull();
  });

  it("queues messages until a verified origin exists, then flushes them", () => {
    const queue: string[] = [];
    expect(enqueueUntilOrigin(null, queue, "seek")).toBeNull();
    expect(enqueueUntilOrigin(null, queue, "play")).toBeNull();
    expect(queue).toEqual(["seek", "play"]);
    expect(enqueueUntilOrigin(loopback, queue, "pause")).toBe("pause");
    expect(takeQueuedMessages(queue)).toEqual(["seek", "play"]);
    expect(queue).toEqual([]);
  });
});
