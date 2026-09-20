export const limits = {
  minSize: 1,
  maxSize: 16384,
  minFps: 1,
  maxFps: 240,
  minDurationSeconds: Number.MIN_VALUE,
  maxDurationSeconds: 3600,
  emptyDurationSeconds: 3,
  defaultBlockSeconds: 3,
  maxControls: 24,
  maxSelectOptions: 20,
  maxTracks: 64,
  maxMarkers: 256,
  minRate: 0.25,
  maxRate: 4,
  minVolume: 0,
  maxVolume: 1,
  maxProjectArchiveBytes: 8 * 1024 * 1024 * 1024,
  maxProjectArchiveFiles: 10_000,
} as const;

export const mediaExtensions = [
  "aac",
  "flac",
  "m4a",
  "mkv",
  "mov",
  "mp3",
  "mp4",
  "ogg",
  "opus",
  "wav",
  "webm",
] as const;

export const imageExtensions = ["gif", "jpeg", "jpg", "png", "svg", "webp"] as const;

export const exportFormats = ["png", "gif", "webp", "mp4", "webm", "mp3", "wav", "ogg"] as const;

export const loopbackHost = "127.0.0.1";
export const loopbackPort = 47821;
export const cdpHost = "127.0.0.1";
export const cdpPort = 47822;
