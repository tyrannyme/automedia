import { frameCount, frameFromTime } from "@shared/clock.ts";

function padTimecode(value: number, size = 2): string {
  return String(value).padStart(size, "0");
}

export function formatTimecode(seconds: number, fps: number): string {
  const clamped = Math.max(0, seconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const whole = Math.floor(clamped % 60);
  const frames = Math.floor((clamped - Math.floor(clamped)) * fps);
  return `${padTimecode(hours)}:${padTimecode(minutes)}:${padTimecode(whole)}:${padTimecode(frames)}`;
}

export function formatFrameIndex(seconds: number, fps: number, durationSeconds: number): string {
  const current = frameFromTime(seconds, fps, durationSeconds);
  const total = frameCount(durationSeconds, fps);
  return `${current} / ${total}`;
}

export function formatLengthSeconds(seconds: number): string {
  const rounded = Math.round(Math.max(0, seconds) * 100) / 100;
  return `${rounded}s`;
}
