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
