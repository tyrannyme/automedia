export function formatInspectorNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 1000) / 1000);
}

export function finiteNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function clampInspectorNumber(
  value: string,
  fallback: number,
  min: number,
  max: number,
): number {
  return Math.min(max, Math.max(min, finiteNumber(value, fallback)));
}

export function minimumClipDuration(fps: number): number {
  return 1 / Math.max(1, fps);
}

export function clampClipDuration(
  value: string,
  fallback: number,
  fps: number,
  max: number,
): number {
  const min = minimumClipDuration(fps);
  return clampInspectorNumber(value, fallback, min, Math.max(min, max));
}

/** "0:04.00": a clip time for the panel's DM Mono fields. */
export function formatClipTime(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const hundredths = Math.round(safe * 100);
  const minutes = Math.floor(hundredths / 6000);
  const rest = (hundredths - minutes * 6000) / 100;
  return `${minutes}:${rest.toFixed(2).padStart(5, "0")}`;
}

/** Reads "4", "4.5", "0:04.00" or "1:05.5" as seconds; null when it is not a time. */
export function parseClipTime(text: string): number | null {
  const value = text.trim();
  const clock = /^(\d+):(\d{1,2}(?:\.\d*)?)$/.exec(value);
  if (clock) {
    const seconds = Number(clock[2]);
    if (seconds >= 60) return null;
    return Number(clock[1]) * 60 + seconds;
  }
  if (value === "") return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? seconds : null;
}
