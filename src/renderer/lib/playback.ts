export function playFrom(playheadSeconds: number, durationSeconds: number) {
  if (playheadSeconds >= durationSeconds) {
    return { playheadSeconds: 0, playing: true as const };
  }
  return { playheadSeconds, playing: true as const };
}

export function wrapPlayback(seconds: number, durationSeconds: number, loop: boolean) {
  if (seconds < durationSeconds) {
    return { timeSeconds: seconds, playing: true as const, wrapped: false as const };
  }
  if (loop && durationSeconds > 0) {
    return {
      timeSeconds: seconds % durationSeconds,
      playing: true as const,
      wrapped: true as const,
    };
  }
  return { timeSeconds: durationSeconds, playing: false as const, wrapped: false as const };
}

export function applyPlaybackTime(seconds: number, durationSeconds: number, loop: boolean) {
  const next = wrapPlayback(seconds, durationSeconds, loop);
  return {
    playheadSeconds: next.timeSeconds,
    playing: next.playing,
    wrapped: next.wrapped,
  };
}

export function applyPreviewTime(
  editorPlaying: boolean,
  seconds: number,
  durationSeconds: number,
  loop: boolean,
) {
  if (!editorPlaying) return null;
  return applyPlaybackTime(seconds, durationSeconds, loop);
}

export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
