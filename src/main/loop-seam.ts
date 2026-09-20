import type { Page } from "playwright";
import { frameCount, timeFromFrame } from "@shared/clock.ts";
import { seekInjectedRuntime, waitForPaint } from "./page-runtime.ts";

export type LoopSeamTimes = {
  first: { timeSeconds: number; frame: number };
  last: { timeSeconds: number; frame: number };
};

export function loopSeamTimes(fps: number, durationSeconds: number): LoopSeamTimes {
  const last = Math.max(0, frameCount(durationSeconds, fps) - 1);
  return {
    first: { timeSeconds: 0, frame: 0 },
    last: { timeSeconds: timeFromFrame(last, fps), frame: last },
  };
}

export function pngsMatch(first: Uint8Array, last: Uint8Array): boolean {
  if (first.byteLength !== last.byteLength) return false;
  return Buffer.from(first).equals(Buffer.from(last));
}

export async function captureLoopSeam(
  page: Page,
  fps: number,
  durationSeconds: number,
): Promise<boolean> {
  const times = loopSeamTimes(fps, durationSeconds);
  await seekInjectedRuntime(page, times.first.timeSeconds, times.first.frame);
  await waitForPaint(page);
  const first = await page.screenshot({ type: "png", scale: "device" });
  await seekInjectedRuntime(page, times.last.timeSeconds, times.last.frame);
  await waitForPaint(page);
  const last = await page.screenshot({ type: "png", scale: "device" });
  return pngsMatch(first, last);
}
